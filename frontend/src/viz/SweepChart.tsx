import { useState } from 'react';
import { type SweepPoint } from '../sim/sweep';

// Throughput-vs-fleet-size (left axis, with p10–p90 band) + shovel utilisation (right axis, dashed), the
// MF=1 reference line (theory's knee) and the empirically-detected over-trucking knee. The two knees
// landing together IS the validation: below MF=1 throughput scales with trucks, above it the extra trucks
// only grow the queue.
export function SweepChart({ pts, knee, nMf1, lang }: { pts: SweepPoint[]; knee: number; nMf1: number; lang: 'en' | 'es' }) {
  const es = lang === 'es';
  const [hi, setHi] = useState<number | null>(null);
  const W = 640, H = 340, padL = 56, padR = 48, padT = 16, padB = 46;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const nMax = pts[pts.length - 1].n;
  const yMax = Math.max(...pts.map((p) => p.hi)) * 1.06;
  const sx = (n: number) => padL + (n - 1) / Math.max(1, nMax - 1) * plotW;
  const syT = (t: number) => padT + (1 - t / yMax) * plotH;
  const syU = (u: number) => padT + (1 - u) * plotH;

  const bandPath = `M ${pts.map((p) => `${sx(p.n)},${syT(p.lo)}`).join(' L ')} L ${[...pts].reverse().map((p) => `${sx(p.n)},${syT(p.hi)}`).join(' L ')} Z`;
  const tLine = pts.map((p) => `${sx(p.n)},${syT(p.throughput)}`).join(' ');
  const uLine = pts.map((p) => `${sx(p.n)},${syU(p.util)}`).join(' ');

  return (
    <div className="dl-scatter-wrap" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', font: '11px var(--font-sans, sans-serif)' }} role="img"
        aria-label={es ? 'Producción vs tamaño de flota' : 'Throughput vs fleet size'}>
        {/* left grid + axis (tonnes) */}
        {Array.from({ length: 5 }, (_, i) => { const v = yMax * i / 4; const y = syT(v); return (
          <g key={'y' + i}><line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--color-border)" strokeWidth="1" />
            <text x={padL - 6} y={y + 4} textAnchor="end" fill="var(--color-fg-subtle)">{(v / 1000).toFixed(0)}k</text></g>); })}
        {/* right axis (util %) */}
        {[0, 0.5, 1].map((u) => <text key={'u' + u} x={W - padR + 6} y={syU(u) + 4} fill="#3fb950">{(u * 100).toFixed(0)}%</text>)}
        {/* x ticks */}
        {pts.filter((_, i) => i % 1 === 0).map((p) => <text key={'x' + p.n} x={sx(p.n)} y={H - padB + 16} textAnchor="middle" fill="var(--color-fg-subtle)">{p.n}</text>)}
        <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" fill="var(--color-fg-subtle)">{es ? 'camiones en la flota' : 'trucks in the fleet'}</text>
        <text x={14} y={padT} fill="var(--color-accent)" transform={`rotate(-90 14 ${padT})`} textAnchor="end">{es ? 'producción (t)' : 'throughput (t)'}</text>

        {/* MF=1 reference */}
        <line x1={sx(nMf1)} y1={padT} x2={sx(nMf1)} y2={padT + plotH} stroke="var(--color-fg)" strokeWidth="1.3" strokeDasharray="4 3" />
        <text x={sx(nMf1) + 4} y={padT + 12} fill="var(--color-fg)">MF=1</text>

        {/* throughput band + line */}
        <path d={bandPath} fill="var(--color-accent)" opacity="0.16" />
        <polyline points={tLine} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        {/* utilisation line (right axis) */}
        <polyline points={uLine} fill="none" stroke="#3fb950" strokeWidth="1.6" strokeDasharray="5 3" />
        <text x={sx(nMax) - 4} y={syU(pts[pts.length - 1].util) - 6} textAnchor="end" fill="#3fb950">{es ? 'util. de pala' : 'shovel util'}</text>

        {/* knee marker */}
        <circle cx={sx(pts[knee].n)} cy={syT(pts[knee].throughput)} r="7" fill="none" stroke="#d29922" strokeWidth="2.4" />
        <text x={sx(pts[knee].n)} y={syT(pts[knee].throughput) - 12} textAnchor="middle" fill="#d29922" fontWeight="600">{es ? 'rodilla' : 'knee'}</text>

        {/* hover points */}
        {pts.map((p, i) => <circle key={'h' + p.n} cx={sx(p.n)} cy={syT(p.throughput)} r="9" fill="transparent" style={{ cursor: 'pointer' }} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />)}
        {hi !== null && <circle cx={sx(pts[hi].n)} cy={syT(pts[hi].throughput)} r="3.5" fill="var(--color-accent)" />}
      </svg>
      {hi !== null && (
        <div className="dl-readout" style={{ left: Math.min(sx(pts[hi].n) + 12, 420), top: Math.max(2, syT(pts[hi].throughput) - 10) }}>
          {pts[hi].n} {es ? 'camiones' : 'trucks'} · MF {pts[hi].mf.toFixed(2)} · {(pts[hi].throughput / 1000).toFixed(1)}k t · {es ? 'util' : 'util'} {(pts[hi].util * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}
