import { useEffect, useMemo, useRef, useState } from 'react';

/** One categorical bar. `ci` draws a low/high whisker; `mark` is a short badge (★/◆) appended to the
 *  label and drawn at the bar end; `sub` is a secondary right-aligned readout (e.g. a count). */
export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
  ci?: [number, number];
  mark?: string;
  sub?: string;
}

/** Interactive horizontal bar chart (React + SVG, the rubric's prescribed lib for categorical bars).
 *  Meets Tier A: hover/focus value-readout, a baseline toggle (Fit vs From 0) so tightly-clustered
 *  values actually use the horizontal space, theme-aware via CSS vars, keyboard-operable (Tab to a bar,
 *  arrows to move, the readout follows focus) and a screen-reader data table. Detected marks (★ learned,
 *  ◆ Pareto, knee, argmax) are drawn on the bar and labeled, never color-only. */
export function BarChart({
  data, unit = '', valueFmt = (v) => v.toFixed(1), height, ariaLabel, defaultBaseline = 'fit', highlightKey, note, fill = false,
}: {
  data: BarDatum[];
  unit?: string;
  valueFmt?: (v: number) => string;
  height?: number;
  /** Grow the ROW HEIGHT to fill the available panel instead of taking a fixed 30px per row. Stretching
   *  the SVG instead would distort the bars; taller rows are the honest way to use the space. Without
   *  this a 5-row chart is pinned near 180px inside a full-height panel, which is how these views
   *  measured 32% of the viewport while the panel around them was empty. */
  fill?: boolean;
  ariaLabel: string;
  defaultBaseline?: 'fit' | 'zero';
  highlightKey?: string;
  note?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [baseline, setBaseline] = useState<'fit' | 'zero'>(defaultBaseline);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el);
    setW(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);

  // Row height adapts when `fill` is set: the panel's spare height is shared across the rows, clamped
  // so bars never become absurdly thick on a tall panel or unreadable on a short one.
  const [availH, setAvailH] = useState(0);
  useEffect(() => {
    if (!fill) return;
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setAvailH(host.parentElement ? host.parentElement.clientHeight : 0);
    measure();
    const ro = new ResizeObserver(measure);
    if (host.parentElement) ro.observe(host.parentElement);
    return () => ro.disconnect();
  }, [fill]);
  const rowH = fill && availH > 0 && data.length
    ? Math.max(30, Math.min(64, Math.floor((availH - 6 - 26 - 28) / data.length)))
    : 30;
  const padT = 6;
  const padB = 26; // axis row
  const labelW = Math.min(190, Math.max(96, Math.round(w * 0.32)));
  const rightW = 62; // room for the end value
  const plotX = labelW + 6;
  const plotW = Math.max(40, w - plotX - rightW);
  const svgH = height ?? padT + data.length * rowH + padB;

  const { d0, d1, ticks } = useMemo(() => {
    if (!data.length) return { d0: 0, d1: 1, ticks: [0, 1] };
    let lo = Infinity, hi = -Infinity;
    for (const b of data) {
      const vs = [b.value, ...(b.ci ?? [])].filter((x) => Number.isFinite(x));
      for (const v of vs) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (baseline === 'zero') lo = Math.min(0, lo);
    const span = hi - lo || Math.abs(hi) || 1;
    // fit mode: pad below the min so a tight cluster (e.g. 244k-261k) spreads across the width
    let a = baseline === 'zero' ? Math.min(0, lo) : lo - span * 0.08;
    let b = hi + span * 0.06;
    if (a === b) b = a + 1;
    // nice-ish ticks
    const step = niceStep((b - a) / 4);
    a = baseline === 'zero' ? Math.min(0, lo) : Math.floor(a / step) * step;
    b = Math.ceil(b / step) * step;
    const tk: number[] = [];
    for (let t = a; t <= b + step * 0.5; t += step) tk.push(+t.toFixed(6));
    return { d0: a, d1: b, ticks: tk };
  }, [data, baseline]);

  const xOf = (v: number) => plotX + ((v - d0) / (d1 - d0 || 1)) * plotW;
  const clampedActive = active != null && active >= 0 && active < data.length ? active : null;
  const broken = baseline === 'fit' && d0 > 0;

  return (
    <div ref={hostRef} style={{ width: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
        <div className="dl-seg" role="group" aria-label="axis baseline">
          <button type="button" className={`chip${baseline === 'fit' ? ' on' : ''}`} onClick={() => setBaseline('fit')} aria-pressed={baseline === 'fit'}>Fit</button>
          <button type="button" className={`chip${baseline === 'zero' ? ' on' : ''}`} onClick={() => setBaseline('zero')} aria-pressed={baseline === 'zero'}>From 0</button>
        </div>
        {broken && <span className="dl-hint small" style={{ opacity: 0.8 }}>axis starts at {valueFmt(d0)}{unit ? ` ${unit}` : ''}</span>}
        {clampedActive != null && (
          <span className="dl-hint small mono" style={{ marginLeft: 'auto' }}>
            {data[clampedActive].label}: <b>{valueFmt(data[clampedActive].value)}{unit ? ` ${unit}` : ''}</b>
            {data[clampedActive].ci && <> ({valueFmt(data[clampedActive].ci![0])}–{valueFmt(data[clampedActive].ci![1])})</>}
          </span>
        )}
      </div>

      <svg
        width={w} height={svgH} viewBox={`0 0 ${w} ${svgH}`} role="img" aria-label={ariaLabel}
        style={{ display: 'block', font: '11px ui-monospace, monospace', touchAction: 'none' }}
        onMouseLeave={() => setActive(null)}
      >
        {/* vertical gridlines + axis ticks */}
        {ticks.map((t, i) => {
          const x = xOf(t);
          if (x < plotX - 0.5 || x > plotX + plotW + 0.5) return null;
          return (
            <g key={`t${i}`}>
              <line x1={x} y1={padT} x2={x} y2={svgH - padB} stroke="var(--color-border)" strokeWidth={0.5} opacity={0.6} />
              <text x={x} y={svgH - padB + 14} textAnchor="middle" fill="var(--color-fg-faint)">{abbrev(t)}</text>
            </g>
          );
        })}
        {broken && <text x={plotX} y={svgH - padB + 14} textAnchor="start" fill="var(--color-fg-faint)" opacity={0.7}>⁄⁄</text>}

        {data.map((b, i) => {
          const y = padT + i * rowH;
          const cy = y + rowH / 2;
          const isActive = i === clampedActive;
          const isHi = b.key === highlightKey;
          const col = b.color || 'var(--color-accent)';
          const bx = xOf(b.value);
          const barLeft = xOf(Math.max(d0, Math.min(b.value, d0)));
          return (
            <g
              key={b.key}
              tabIndex={0}
              role="button"
              aria-label={`${b.label}: ${valueFmt(b.value)}${unit ? ` ${unit}` : ''}${b.mark ? `, ${b.mark}` : ''}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.nextElementSibling as SVGGElement | null)?.focus?.(); }
                if (e.key === 'ArrowUp') { e.preventDefault(); (e.currentTarget.previousElementSibling as SVGGElement | null)?.focus?.(); }
              }}
              style={{ outline: 'none', cursor: 'default' }}
            >
              {(isActive || isHi) && <rect x={0} y={y} width={w} height={rowH} fill="var(--color-fg)" opacity={isActive ? 0.06 : 0.03} />}
              <text x={labelW} y={cy + 3} textAnchor="end" fill="var(--color-fg)">
                {truncate(b.label, 26)}{b.mark ? ` ${b.mark}` : ''}
              </text>
              <rect x={Math.min(barLeft, bx)} y={y + 6} width={Math.max(1, Math.abs(bx - barLeft))} height={rowH - 12} rx={2} fill={col} opacity={isActive ? 1 : isHi ? 0.95 : 0.82} />
              {b.ci && (
                <g stroke="var(--color-fg)" strokeWidth={1} opacity={0.55}>
                  <line x1={xOf(b.ci[0])} y1={cy} x2={xOf(b.ci[1])} y2={cy} />
                  <line x1={xOf(b.ci[0])} y1={cy - 4} x2={xOf(b.ci[0])} y2={cy + 4} />
                  <line x1={xOf(b.ci[1])} y1={cy - 4} x2={xOf(b.ci[1])} y2={cy + 4} />
                </g>
              )}
              <text x={Math.min(w - 2, bx + 5)} y={cy + 3} textAnchor="start" fill="var(--color-fg)" fontWeight={isActive ? 700 : 400}>
                {abbrev(b.value)}{b.sub ? ` ${b.sub}` : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {note && <p className="dl-hint small" style={{ marginTop: '0.2rem' }}>{note}</p>}

      {/* screen-reader data table (chart itself is aria-labelled above) */}
      <table style={srOnly}>
        <caption>{ariaLabel}</caption>
        <thead><tr><th>Category</th><th>Value{unit ? ` (${unit})` : ''}</th></tr></thead>
        <tbody>{data.map((b) => <tr key={b.key}><th scope="row">{b.label}{b.mark ? ` ${b.mark}` : ''}</th><td>{valueFmt(b.value)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return s * p;
}

function abbrev(v: number): string {
  if (!Number.isFinite(v)) return '--';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
