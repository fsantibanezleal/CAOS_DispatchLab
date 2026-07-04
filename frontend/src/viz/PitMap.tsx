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
const queueColor = (q: number) => lerpColor([63, 185, 80], [248, 81, 73], q / 5); // green → red over 0..5

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

  const nodes = useMemo(() => [...c.mine.shovels.map((s) => s.pos), ...c.mine.dumps.map((d) => d.pos)], [c]);
  const bounds = useMemo(() => {
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [nodes]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = cv.clientWidth || 700, ch = Math.max(300, Math.round(cw * 0.5));
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

    // roads
    g.strokeStyle = border; g.lineWidth = 7; g.lineCap = 'round';
    for (const s of c.mine.shovels) for (const d of c.mine.dumps) if (c.mine.routes[`${s.id}->${d.id}`]) {
      g.beginPath(); g.moveTo(sx(s.pos.x), sy(s.pos.y)); g.lineTo(sx(d.pos.x), sy(d.pos.y)); g.stroke();
    }

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
      truckDraw.push({ x: sx(active.x0 + (active.x1 - active.x0) * f), y: sy(active.y0 + (active.y1 - active.y0) * f), color: STATE_COLOR[active.state] });
    }

    // shovels (squares), color by queue
    for (const s of c.mine.shovels) {
      const q = qShovel.get(s.id) ?? 0; const x = sx(s.pos.x), y = sy(s.pos.y);
      g.fillStyle = queueColor(q); g.strokeStyle = fg; g.lineWidth = 1.5;
      g.beginPath(); g.rect(x - 13, y - 13, 26, 26); g.fill(); g.stroke();
      g.fillStyle = fg; g.font = '600 11px ui-sans-serif, sans-serif'; g.textAlign = 'center';
      g.fillText(s.name.split('(')[0].trim(), x, y - 20);
      g.fillStyle = '#0d1117'; g.font = '700 12px ui-monospace, monospace'; g.fillText(String(q), x, y + 4);
    }
    // dumps (diamonds)
    for (const d of c.mine.dumps) {
      const q = qDump.get(d.id) ?? 0; const x = sx(d.pos.x), y = sy(d.pos.y);
      g.fillStyle = queueColor(q); g.strokeStyle = fg; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + 16, y); g.lineTo(x, y + 16); g.lineTo(x - 16, y); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = fg; g.font = '600 11px ui-sans-serif, sans-serif'; g.textAlign = 'center';
      g.fillText(d.name, x, y - 22);
      g.fillStyle = '#0d1117'; g.font = '700 12px ui-monospace, monospace'; g.fillText(String(q), x, y + 4);
    }
    // trucks
    for (const td of truckDraw) {
      g.fillStyle = td.color; g.strokeStyle = surface; g.lineWidth = 1;
      g.beginPath(); g.rect(td.x - 5, td.y - 4, 10, 8); g.fill(); g.stroke();
    }
    // legend
    g.textAlign = 'left'; g.font = '11px ui-sans-serif, sans-serif';
    const leg = [[STATE_COLOR.haulFull, es ? 'cargado' : 'loaded'], [STATE_COLOR.haulEmpty, es ? 'vacío' : 'empty'], ['#8b949e', es ? 'en cola' : 'queued']];
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
