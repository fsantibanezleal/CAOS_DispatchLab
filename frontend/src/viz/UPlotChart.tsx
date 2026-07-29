import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useThemeStore } from '@fasl-work/caos-app-shell';

/** Interactive uPlot chart: wheel/drag zoom + pan, crosshair readout, theme-aware, responsive.
 * `build` produces the options for a given width/height (rebuilt on theme/data change). */
export function UPlotChart({
  data, build, plugins = [], height, onClickX, fill = false, minHeight = 180,
}: {
  data: uPlot.AlignedData;
  build: (width: number, height: number) => uPlot.Options;
  plugins?: uPlot.Plugin[];
  /** Fixed pixel height. Omit and pass `fill` to size from the container instead. */
  height?: number;
  onClickX?: (x: number) => void;
  /** Fill the parent's height rather than taking a hardcoded one. A chart pinned to 180px inside a
   *  full-height panel leaves the rest of the panel empty, which is how sub-views ended up using
   *  15-32% of the viewport while the page around them had room to spare. */
  fill?: boolean;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.clientWidth || 600;
    const measure = () => (fill
      ? Math.max(minHeight, el.parentElement ? el.parentElement.clientHeight - 8 : minHeight)
      : (height ?? minHeight));
    const h0 = measure();
    const opts = build(width, h0);
    opts.plugins = [...(opts.plugins ?? []), ...plugins];
    const u = new uPlot(opts, data, el);
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth || width, height: measure() }));
    ro.observe(el);
    let click: ((e: MouseEvent) => void) | null = null;
    if (onClickX) {
      click = () => { const left = u.cursor.left ?? -1; if (left >= 0) onClickX(u.posToVal(left, 'x')); };
      el.addEventListener('click', click);
    }
    return () => {
      ro.disconnect();
      if (click) el.removeEventListener('click', click);
      u.destroy();
    };
    // theme/data/plugins drive a rebuild
  }, [theme, data, build, plugins, height, onClickX, fill, minHeight]);

  return <div ref={ref} className="uplot-host" style={{ width: '100%', height }} />;
}
