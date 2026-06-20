import { useMemo, useState } from 'react';
import { type PolicyStats, POLICY_COLOR } from '../sim/compare';

// Pareto scatter: tonnes (↑ better) vs truck wait (← better). One faint dot per policy×seed (the honest
// spread), a bold marker at each policy's median, and the non-dominated frontier joined. Hover a median for
// its band. Dispatch is multi-objective — collapsing to one bar would hide the trade-off.
export function ParetoScatter({ stats, front, lang }: { stats: PolicyStats[]; front: Set<string>; lang: 'en' | 'es' }) {
  const es = lang === 'es';
  const [hover, setHover] = useState<{ x: number; y: number; s: PolicyStats } | null>(null);
  const W = 620, H = 380, padL = 64, padB = 52, padT = 16, padR = 16;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const xs: number[] = [], ys: number[] = [];
    for (const s of stats) { s.waitH.forEach((w) => xs.push(w)); s.tonnes.forEach((tn) => ys.push(tn)); }
    const xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(...ys), yhi = Math.max(...ys);
    const xp = (xhi - xlo) * 0.08 || 1, yp = (yhi - ylo) * 0.08 || 1;
    return { xMin: Math.max(0, xlo - xp), xMax: xhi + xp, yMin: ylo - yp, yMax: yhi + yp };
  }, [stats]);

  const sx = (x: number) => padL + (x - xMin) / Math.max(1e-9, xMax - xMin) * plotW;
  const sy = (y: number) => padT + (1 - (y - yMin) / Math.max(1e-9, yMax - yMin)) * plotH;

  const frontMedians = stats.filter((s) => front.has(s.id)).sort((a, b) => a.medWaitH - b.medWaitH);
  const gridY = 4, gridX = 4;

  return (
    <div className="dl-scatter-wrap" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block', font: '11px var(--font-sans, sans-serif)' }} role="img"
        aria-label={es ? 'Dispersión de Pareto: toneladas vs espera de camión' : 'Pareto scatter: tonnes vs truck wait'}>
        {/* gridlines + axis labels */}
        {Array.from({ length: gridY + 1 }, (_, i) => { const v = yMin + (yMax - yMin) * i / gridY; const y = sy(v); return (
          <g key={'y' + i}><line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--color-border)" strokeWidth="1" />
            <text x={padL - 6} y={y + 4} textAnchor="end" fill="var(--color-fg-subtle)">{(v / 1000).toFixed(0)}k</text></g>); })}
        {Array.from({ length: gridX + 1 }, (_, i) => { const v = xMin + (xMax - xMin) * i / gridX; const x = sx(v); return (
          <text key={'x' + i} x={x} y={H - padB + 16} textAnchor="middle" fill="var(--color-fg-subtle)">{v.toFixed(1)}</text>); })}
        <text x={padL} y={H - 6} fill="var(--color-fg-subtle)">{es ? '← espera de camión (h) · menos es mejor' : '← truck wait (h) · less is better'}</text>
        <text x={14} y={padT + 8} fill="var(--color-fg-subtle)" transform={`rotate(-90 14 ${padT + 8})`} textAnchor="end">{es ? 'toneladas · más es mejor ↑' : 'tonnes · more is better ↑'}</text>

        {/* frontier */}
        {frontMedians.length > 1 && <polyline fill="none" stroke="var(--color-fg-subtle)" strokeWidth="1.4" strokeDasharray="5 4"
          points={frontMedians.map((s) => `${sx(s.medWaitH)},${sy(s.medTonnes)}`).join(' ')} />}

        {/* seed cloud */}
        {stats.map((s) => s.waitH.map((w, i) => (
          <circle key={s.id + i} cx={sx(w)} cy={sy(s.tonnes[i])} r="2.4" fill={POLICY_COLOR[s.id]} opacity="0.33" />
        )))}

        {/* median markers */}
        {stats.map((s) => {
          const x = sx(s.medWaitH), y = sy(s.medTonnes), on = front.has(s.id);
          const leftSide = x > W * 0.62;   // labels on right-side points render to the LEFT to stay in frame
          return (
            <g key={s.id} style={{ cursor: 'pointer' }} onMouseEnter={() => setHover({ x, y, s })} onMouseLeave={() => setHover(null)}>
              <circle cx={x} cy={y} r={on ? 8 : 6} fill={POLICY_COLOR[s.id]} stroke={on ? 'var(--color-fg)' : 'var(--color-surface)'} strokeWidth={on ? 2 : 1.5} />
              <text x={leftSide ? x - 11 : x + 11} y={y + 4} textAnchor={leftSide ? 'end' : 'start'} fill="var(--color-fg)" fontSize="10.5" fontWeight={on ? 700 : 400}>{(es ? s.es : s.en).split(' (')[0]}</text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="dl-readout" style={{ left: Math.min(hover.x + 12, 360), top: Math.max(2, hover.y - 10) }}>
          <b>{(es ? hover.s.es : hover.s.en).split(' (')[0]}</b> · {(hover.s.medTonnes / 1000).toFixed(1)}k t · {hover.s.medWaitH.toFixed(1)} h
          <br />{es ? 'banda' : 'band'} {(hover.s.loT / 1000).toFixed(1)}–{(hover.s.hiT / 1000).toFixed(1)}k t
        </div>
      )}
    </div>
  );
}
