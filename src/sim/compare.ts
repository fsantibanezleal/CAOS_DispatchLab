// Multi-objective policy comparison. A policy's outcome is a DISTRIBUTION over seeds, not one number, so we
// run every policy over the same seed set and report medians + p10–p90 bands. Dispatch is genuinely
// multi-objective (tonnes vs truck wait), so the honest summary is a Pareto frontier, plus a TIE rule: if a
// rival's tonnes band overlaps the leader's, the difference is "not significant" — no overconfident winner.
import { runSimulation } from './model';
import { POLICIES } from '../policies/heuristics';
import { type CaseSpec } from './types';

export interface PolicyStats {
  id: string; en: string; es: string;
  tonnes: number[]; waitH: number[];
  medTonnes: number; medWaitH: number;
  loT: number; hiT: number; loW: number; hiW: number;   // p10 / p90 bands
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };

export function comparePolicies(c: CaseSpec, seeds: number[]): PolicyStats[] {
  return POLICIES.map((p) => {
    const tonnes: number[] = [], waitH: number[] = [];
    for (const s of seeds) { const r = runSimulation(c, p.fn, s); tonnes.push(r.tonnes); waitH.push(r.truckWaitSec / 3600); }
    return { id: p.id, en: p.en, es: p.es, tonnes, waitH, medTonnes: median(tonnes), medWaitH: median(waitH), loT: pct(tonnes, 0.1), hiT: pct(tonnes, 0.9), loW: pct(waitH, 0.1), hiW: pct(waitH, 0.9) };
  });
}

/** Pareto-optimal policies on the medians: maximise tonnes, minimise truck wait. */
export function paretoFront(stats: PolicyStats[]): Set<string> {
  const f = new Set<string>();
  for (const a of stats) {
    const dominated = stats.some((b) => b.id !== a.id && b.medTonnes >= a.medTonnes && b.medWaitH <= a.medWaitH && (b.medTonnes > a.medTonnes || b.medWaitH < a.medWaitH));
    if (!dominated) f.add(a.id);
  }
  return f;
}

/** TIE rule on tonnes: the leader plus any policy whose tonnes band overlaps the leader's. */
export function tieVerdict(stats: PolicyStats[]): { leader: string; tied: string[] } {
  const leader = [...stats].sort((a, b) => b.medTonnes - a.medTonnes)[0];
  const tied = stats.filter((s) => s.id !== leader.id && s.hiT >= leader.loT && s.loT <= leader.hiT).map((s) => s.id);
  return { leader: leader.id, tied };
}

export const POLICY_COLOR: Record<string, string> = {
  greedy: '#58a6ff', shortestWait: '#3fb950', minTruckWait: '#d29922', minShovelWait: '#bc8cff', fixed: '#8b949e',
};
