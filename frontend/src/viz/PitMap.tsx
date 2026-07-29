import { useEffect, useMemo, useRef, useState } from 'react';
import { type CaseSpec, type SimResult, type Leg } from '../sim/types';

// Animated node-link pit map (Canvas2D): roads, shovels (squares) and dumps (diamonds) coloured by their
// live queue depth, and truck sprites interpolated along their current leg at the playback time t. This is
// the only view that fuses topology + live flow + per-node queue, what actually differentiates policies.
const STATE_COLOR: Record<Leg['state'], string> = { haulFull: '#d29922', haulEmpty: '#58a6ff', atShovel: '#8b949e', atDump: '#8b949e' };

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const queueColor = (q: number) => lerpColor([63, 185, 80], [248, 81, 73], q / 5); // green -> red over 0..5

/** Stockpile level (tonnes) at playback time t, from the step series baked into the result. */
function levelAt(series: { t: number; level: number }[] | undefined, t: number): number {
  if (!series || series.length === 0) return 0;
  let lvl = series[0].level;
  for (const p of series) { if (p.t <= t) lvl = p.level; else break; }
  return lvl;
}

type Pt = { x: number; y: number };
/** The 2D surface road network (#87): a shared trunk from the portal to a junction, then curved spurs to
 *  each destination. Mirrors the 3D topo network so hauls follow real roads, never a straight rim->dump line. */
function surfaceNet(c: CaseSpec): { junction: Pt; trunk: Pt[]; spurs: Record<number, Pt[]> } | null {
  const portal = c.mine.portal;
  if (!portal) return null;
  const dumps = c.mine.dumps;
  const cx = dumps.reduce((a, d) => a + d.pos.x, 0) / (dumps.length || 1);
  const cy = dumps.reduce((a, d) => a + d.pos.y, 0) / (dumps.length || 1);
  const junction: Pt = { x: portal.x + (cx - portal.x) * 0.45, y: portal.y + (cy - portal.y) * 0.45 };
  const curve = (a: Pt, b: Pt, bend: number): Pt[] => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const ctrl = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
    const n = Math.max(6, Math.ceil(len / 40)); const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push({ x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x, y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y }); }
    return pts;
  };
  const dTo = (p: Pt) => Math.hypot(p.x - portal.x, p.y - portal.y);
  const trunk = curve(portal, junction, dTo(junction) * 0.12);
  const spurs: Record<number, Pt[]> = {};
  dumps.forEach((d, i) => { spurs[d.id] = curve(junction, d.pos, Math.hypot(d.pos.x - junction.x, d.pos.y - junction.y) * 0.16 * (i % 2 ? 1 : -1)); });
  return { junction, trunk, spurs };
}
function nearestDumpId(c: CaseSpec, p: Pt): number | null {
  let best: number | null = null, bd = Infinity;
  for (const d of c.mine.dumps) { const dd = Math.hypot(d.pos.x - p.x, d.pos.y - p.y); if (dd < bd) { bd = dd; best = d.id; } }
  return best;
}
/** The haul polyline for a leg: shovel -> portal -> trunk -> junction -> spur -> destination (loaded), or its
 *  reverse (empty), so the truck travels the drawn road network, never a straight line. No portal (real
 *  sample) -> legacy straight segment. */
function legPoly(c: CaseSpec, l: Leg): { x: number; y: number }[] {
  const portal = c.mine.portal;
  const a = { x: l.x0, y: l.y0 }, b = { x: l.x1, y: l.y1 };
  if (!portal) return [a, b];
  const net = surfaceNet(c);
  if (!net) return [a, portal, b];
  const dumpEnd = l.state === 'haulFull' ? b : a;
  const shovelEnd = l.state === 'haulFull' ? a : b;
  const did = nearestDumpId(c, dumpEnd);
  const spur = did != null ? net.spurs[did] : null;
  const loaded = [shovelEnd, portal, ...net.trunk.slice(1), ...(spur ? spur.slice(1) : [dumpEnd])];
  return l.state === 'haulFull' ? loaded : loaded.slice().reverse();
}
/** Position at fraction f in [0,1] of the polyline's arc length (constant spatial speed; always on a road). */
function posAlong(pts: { x: number; y: number }[], f: number): { x: number; y: number } {
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  if (total <= 0) return pts[0];
  let target = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) { const t = seg[i] ? target / seg[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
    target -= seg[i];
  }
  return pts[pts.length - 1];
}

export function PitMap({ c, result, t, lang }: { c: CaseSpec; result: SimResult; t: number; lang: 'en' | 'es' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ px: number; py: number; label: string } | null>(null);
  const es = lang === 'es';

  // group legs per truck once per simulation result (not per frame)
  const byTruck = useMemo(() => {
    const m = new Map<number, Leg[]>();
    for (const l of result.trace ?? []) { const a = m.get(l.truck) ?? []; a.push(l); m.set(l.truck, a); }
    for (const a of m.values()) a.sort((x, y) => x.t0 - y.t0);
    return m;
  }, [result]);

  const nodes = useMemo(() => [...c.mine.shovels.map((s) => s.pos), ...c.mine.dumps.map((d) => d.pos), ...(c.mine.portal ? [c.mine.portal] : [])], [c]);
  const bounds = useMemo(() => {
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [nodes]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    // Same rule as Pit3D: height comes from the space LEFT in the view, not from the width. Deriving
    // it from the width means a wider panel produces a taller canvas and pushes the controls and KPI
    // row below the fold.
    const cw = cv.clientWidth || 700;
    let ch = Math.max(300, Math.round(cw * 0.5));
    const scroller = cv.closest('.dl-tabpanel') as HTMLElement | null;
    if (scroller) {
      const others = scroller.scrollHeight - cv.getBoundingClientRect().height;
      ch = Math.max(260, Math.min(ch, scroller.clientHeight - others - 8));
    }
    cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const g = cv.getContext('2d'); if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const pad = 64;
    const { minX, maxX, minY, maxY } = bounds;
    const sx = (x: number) => pad + (x - minX) / Math.max(1, maxX - minX) * (cw - 2 * pad);
    const sy = (y: number) => pad + (y - minY) / Math.max(1, maxY - minY) * (ch - 2 * pad);
    const cs = getComputedStyle(document.documentElement);
    const fg = cs.getPropertyValue('--color-fg').trim() || '#c9d1d9';
    const dim = cs.getPropertyValue('--color-fg-subtle').trim() || '#8b949e';
    const border = cs.getPropertyValue('--color-border').trim() || '#30363d';
    const surface = cs.getPropertyValue('--color-surface').trim() || '#161b22';

    // roads. Portal mines: internal pit roads (shovel -> portal) + a direct surface haul (portal -> each
    // destination). Every haul, loaded or empty, runs on these through the single pit exit. Legacy mines
    // (real samples) keep the straight shovel -> dump roads.
    const portal = c.mine.portal;
    g.strokeStyle = border; g.lineCap = 'round';
    if (portal) {
      const net = surfaceNet(c);
      // internal pit roads (thicker, the ramp network to the exit)
      g.lineWidth = 6;
      for (const s of c.mine.shovels) { g.beginPath(); g.moveTo(sx(s.pos.x), sy(s.pos.y)); g.lineTo(sx(portal.x), sy(portal.y)); g.stroke(); }
      // surface road network: shared trunk (portal -> junction) + curved spurs (junction -> each dump)
      const drawPoly = (pts: Pt[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sy(p.y)) : g.moveTo(sx(p.x), sy(p.y)))); g.stroke(); };
      g.lineWidth = 8;
      if (net) {
        drawPoly(net.trunk);
        for (const d of c.mine.dumps) if (net.spurs[d.id]) drawPoly(net.spurs[d.id]);
        // junction marker
        g.save(); g.fillStyle = border; g.beginPath(); g.arc(sx(net.junction.x), sy(net.junction.y), 4, 0, Math.PI * 2); g.fill(); g.restore();
      }
    } else {
      g.lineWidth = 7;
      for (const s of c.mine.shovels) for (const d of c.mine.dumps) if (c.mine.routes[`${s.id}->${d.id}`]) {
        g.beginPath(); g.moveTo(sx(s.pos.x), sy(s.pos.y)); g.lineTo(sx(d.pos.x), sy(d.pos.y)); g.stroke();
      }
    }
    // reclaim conveyors (dashed): a stockpile feeds its target crusher (the source side of the buffer)
    g.save(); g.setLineDash([6, 6]); g.strokeStyle = '#e3b341'; g.lineWidth = 2.5;
    for (const sp of c.mine.dumps.filter((d) => d.kind === 'stockpile')) {
      const tgt = c.mine.dumps.find((d) => d.id === (sp.reclaimTargetId ?? -1) && d.kind === 'crusher')
        ?? c.mine.dumps.find((d) => d.kind === 'crusher');
      if (tgt) { g.beginPath(); g.moveTo(sx(sp.pos.x), sy(sp.pos.y)); g.lineTo(sx(tgt.pos.x), sy(tgt.pos.y)); g.stroke(); }
    }
    g.restore();

    // live queue counts at time t
    const qShovel = new Map<number, number>(), qDump = new Map<number, number>();
    const truckDraw: { x: number; y: number; color: string }[] = [];
    for (const legs of byTruck.values()) {
      let active: Leg | undefined;
      for (const l of legs) { if (t >= l.t0 && t < l.t1) { active = l; break; } }
      if (!active) continue;
      if (active.state === 'atShovel') qShovel.set(active.node, (qShovel.get(active.node) ?? 0) + 1);
      if (active.state === 'atDump') qDump.set(active.node, (qDump.get(active.node) ?? 0) + 1);
      const f = active.t1 > active.t0 ? (t - active.t0) / (active.t1 - active.t0) : 0;
      // haul legs travel the pit-road polyline through the portal; queued/serving legs sit at their node
      const p = (active.state === 'haulFull' || active.state === 'haulEmpty')
        ? posAlong(legPoly(c, active), f) : { x: active.x0, y: active.y0 };
      truckDraw.push({ x: sx(p.x), y: sy(p.y), color: STATE_COLOR[active.state] });
    }

    // shovels (squares), fill by queue, outline by face type (ore = amber, waste = slate)
    for (const s of c.mine.shovels) {
      const q = qShovel.get(s.id) ?? 0; const x = sx(s.pos.x), y = sy(s.pos.y);
      const oreFace = s.faceType === 'ore';
      g.fillStyle = queueColor(q); g.strokeStyle = oreFace ? '#e3b341' : '#8b949e'; g.lineWidth = 3;
      g.beginPath(); g.rect(x - 13, y - 13, 26, 26); g.fill(); g.stroke();
      g.fillStyle = fg; g.font = '600 11px ui-sans-serif, sans-serif'; g.textAlign = 'center';
      g.fillText(s.name.split('(')[0].trim(), x, y - 20);
      g.fillStyle = '#0d1117'; g.font = '700 12px ui-monospace, monospace'; g.fillText(String(q), x, y + 4);
    }
    // dumps: crusher (red diamond) + waste dump (slate diamond) + stockpile (amber pile with a fill level)
    for (const d of c.mine.dumps) {
      const x = sx(d.pos.x), y = sy(d.pos.y);
      if (d.kind === 'stockpile') {
        const cap = d.areaCapacityT ?? 1;
        const lvl = levelAt(result.stockLevels?.[d.id], t);
        const frac = Math.max(0, Math.min(1, lvl / cap));
        const w = 34, h = 26;                                    // pile outline (trapezoid) + fill by level
        g.strokeStyle = '#e3b341'; g.lineWidth = 2; g.fillStyle = surface;
        g.beginPath(); g.moveTo(x - w / 2, y + h / 2); g.lineTo(x - w / 2 + 6, y - h / 2); g.lineTo(x + w / 2 - 6, y - h / 2); g.lineTo(x + w / 2, y + h / 2); g.closePath(); g.fill(); g.stroke();
        g.save(); g.clip();
        g.fillStyle = 'rgba(227,179,65,0.75)';
        g.fillRect(x - w / 2, y + h / 2 - h * frac, w, h * frac);  // fill rises with the pile level
        g.restore();
        g.fillStyle = fg; g.font = '600 11px ui-sans-serif, sans-serif'; g.textAlign = 'center';
        g.fillText(d.name, x, y - h / 2 - 6);
        g.fillStyle = fg; g.font = '700 10px ui-monospace, monospace'; g.fillText(`${(frac * 100).toFixed(0)}%`, x, y + 4);
        continue;
      }
      const q = qDump.get(d.id) ?? 0;
      const isCr = d.kind === 'crusher';
      g.fillStyle = queueColor(q); g.strokeStyle = isCr ? '#f85149' : '#8b949e'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + 16, y); g.lineTo(x, y + 16); g.lineTo(x - 16, y); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = fg; g.font = '600 11px ui-sans-serif, sans-serif'; g.textAlign = 'center';
      g.fillText(d.name + (isCr && (d.bays ?? 1) > 1 ? ` (${d.bays})` : ''), x, y - 22);
      g.fillStyle = '#0d1117'; g.font = '700 12px ui-monospace, monospace'; g.fillText(String(q), x, y + 4);
    }
    // pit portal / exit: the single node all hauls pass through (drawn as a gateway chevron + label)
    if (portal) {
      const px = sx(portal.x), py = sy(portal.y);
      g.fillStyle = surface; g.strokeStyle = fg; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py, 9, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(px - 4, py - 4); g.lineTo(px + 4, py); g.lineTo(px - 4, py + 4); g.stroke();
      g.fillStyle = dim; g.font = '600 10px ui-sans-serif, sans-serif'; g.textAlign = 'center';
      g.fillText(es ? 'salida del rajo' : 'pit exit', px, py + 20);
    }
    // trucks: colored by leg state; loaded ore = amber, loaded waste = slate-brown, empty = blue
    for (const td of truckDraw) {
      g.fillStyle = td.color; g.strokeStyle = surface; g.lineWidth = 1;
      g.beginPath(); g.rect(td.x - 5, td.y - 4, 10, 8); g.fill(); g.stroke();
    }
    // legend
    g.textAlign = 'left'; g.font = '11px ui-sans-serif, sans-serif';
    const leg = [[STATE_COLOR.haulFull, es ? 'cargado' : 'loaded'], [STATE_COLOR.haulEmpty, es ? 'vacío' : 'empty'], ['#f85149', es ? 'chancador' : 'crusher'], ['#8b949e', es ? 'botadero' : 'waste'], ['#e3b341', es ? 'acopio' : 'stockpile']];
    let lx = pad;
    for (const [col, lbl] of leg) { g.fillStyle = col as string; g.fillRect(lx, ch - 16, 10, 8); g.fillStyle = dim; g.fillText(lbl as string, lx + 14, ch - 9); lx += 14 + g.measureText(lbl as string).width + 16; }
  }, [c, result, t, byTruck, bounds, es]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = ref.current!; const rect = cv.getBoundingClientRect();
    const cw = rect.width, ch = rect.height, pad = 64;
    const { minX, maxX, minY, maxY } = bounds;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const sx = (x: number) => pad + (x - minX) / Math.max(1, maxX - minX) * (cw - 2 * pad);
    const sy = (y: number) => pad + (y - minY) / Math.max(1, maxY - minY) * (ch - 2 * pad);
    let found: { px: number; py: number; label: string } | null = null;
    for (const s of c.mine.shovels) if (Math.hypot(px - sx(s.pos.x), py - sy(s.pos.y)) < 20) {
      const k = result.shovels.find((x) => x.id === s.id);
      found = { px, py, label: `${s.name} · ${es ? 'cargas' : 'loads'} ${k?.served ?? 0} · ${es ? 'util' : 'util'} ${((k?.util ?? 0) * 100).toFixed(0)}%` };
    }
    setHover(found);
  };

  return (
    <div className="dl-map-wrap">
      <canvas ref={ref} style={{ width: '100%', display: 'block', borderRadius: 8, cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      {hover && <div className="dl-readout" style={{ left: Math.min(hover.px + 10, 300), top: Math.max(2, hover.py - 8) }}>{hover.label}</div>}
    </div>
  );
}
