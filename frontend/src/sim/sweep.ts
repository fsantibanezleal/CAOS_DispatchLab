// Fleet-size sweep, the validation of the simulator against match-factor theory. For a fixed mine we run
// the sim across truck counts and watch throughput rise ~linearly while the match factor is below 1, then
// saturate as it crosses 1 and the shovels hit 100% utilisation. The empirical over-trucking knee should
// fall at MF≈1, which is exactly what the closed-form predicts. The knee is detected by the Kneedle method
// (max distance from the chord joining the first and last point), with its detection named, not eyeballed.
import { runSimulation } from './model';
import { analyticalMatchFactor } from './matchfactor';
import { type CaseSpec, type Policy } from './types';

export interface SweepPoint { n: number; mf: number; throughput: number; lo: number; hi: number; util: number; }
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };

export function fleetSweep(base: CaseSpec, policy: Policy, nMax: number, seeds: number[]): SweepPoint[] {
  const spec = base.fleet.trucks[0].spec;
  const shovelIds = base.mine.shovels.map((s) => s.id);
  const out: SweepPoint[] = [];
  for (let n = 1; n <= nMax; n++) {
    const c: CaseSpec = { ...base, fleet: { trucks: Array.from({ length: n }, (_, i) => ({ id: i + 1, spec, startShovel: shovelIds[i % shovelIds.length] })) } };
    const tn: number[] = [], ut: number[] = [];
    for (const s of seeds) { const r = runSimulation(c, policy, s); tn.push(r.tonnes); ut.push(r.meanShovelUtil); }
    out.push({ n, mf: analyticalMatchFactor(c, n), throughput: median(tn), lo: pct(tn, 0.1), hi: pct(tn, 0.9), util: median(ut) });
  }
  return out;
}

/** Kneedle: index of the point of maximum distance below the chord from the first to the last point
 * (normalised), i.e. the over-trucking knee of a concave-increasing throughput curve. */
export function kneeIndex(pts: SweepPoint[]): number {
  if (pts.length < 3) return pts.length - 1;
  const x0 = pts[0].n, x1 = pts[pts.length - 1].n;
  const y0 = pts[0].throughput, y1 = pts[pts.length - 1].throughput;
  let best = 0, bestD = -Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    const xN = (pts[i].n - x0) / Math.max(1e-9, x1 - x0);
    const chord = y0 + (y1 - y0) * xN;
    const d = pts[i].throughput - chord;   // positive = above chord = concave knee
    if (d > bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Interpolated truck count where the analytical match factor crosses 1 (the theory's knee). */
export function nAtMf1(pts: SweepPoint[]): number {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i - 1].mf <= 1 && pts[i].mf >= 1) {
      const f = (1 - pts[i - 1].mf) / (pts[i].mf - pts[i - 1].mf);
      return pts[i - 1].n + f * (pts[i].n - pts[i - 1].n);
    }
  }
  return pts[pts.length - 1].mf < 1 ? pts.length : 1;
}
