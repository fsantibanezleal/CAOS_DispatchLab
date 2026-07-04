// Dispatch policies — each decides the next shovel for a truck that just finished dumping. They share one
// cost basis built from the live state (per-shovel queue + in-transit backlog, when the shovel frees, and
// the empty-haul time to reach it) but optimise DIFFERENT objectives, which is the whole point: on an
// asymmetric pit they diverge, and the two classic criteria (min-truck-wait vs min-shovel-wait, Alarie &
// Gamache 2002) provably conflict — you cannot minimise both. Every tie breaks on lowest shovel id so the
// run stays deterministic. The OR tier's joint assignment (Hungarian, `or.ts`) builds on this same cost
// basis; multi-stage LP and blend-MILP remain backlog, not implemented.
import { type Policy, type DispatchState, type ShovelView } from '../sim/types';
import { hungarianPolicy } from './or';

/** Trucks committed ahead of this one at a shovel (waiting + inbound + the one loading). */
const backlog = (v: ShovelView): number => v.queueLen + v.inbound + (v.loading ? 1 : 0);

/** Queue time this truck would face on arrival: the shovel's committed work, less what drains during travel. */
function waitAtArrival(v: ShovelView, travelSec: number): number {
  return Math.max(0, v.freeInSec + backlog(v) * v.loadMeanSec - travelSec);
}

/** argmin over shovels, deterministic tie-break by lowest id. */
function pick(s: DispatchState, cost: (v: ShovelView, travel: number) => number): number {
  let best = s.shovels[0], bestC = Infinity;
  for (const v of s.shovels) {
    const c = cost(v, s.travelEmptySec(v.id));
    if (c < bestC - 1e-9 || (Math.abs(c - bestC) <= 1e-9 && v.id < best.id)) { best = v; bestC = c; }
  }
  return best.id;
}

/** 1. Fixed/static — the truck always returns to its home shovel. The do-nothing floor (no reaction to state). */
export const fixed: Policy = (s) => s.truck.startShovel;

/** 2. Greedy earliest-completion — minimise when THIS truck finishes loading (travel + queue + load). Myopic:
 * over-trucks the nearest/fastest shovel. At MF≈1 it ties the optimisers. */
export const greedy: Policy = (s) => pick(s, (v, t) => t + waitAtArrival(v, t) + v.loadMeanSec);

/** 3. Shortest-expected-wait — minimise the queue time only, using queue + in-transit (not raw queue, which
 * would let bunching reappear). The best cheap default. */
export const shortestWait: Policy = (s) => pick(s, (v) => backlog(v) * v.loadMeanSec);

/** 4. Min-truck-wait ("maximise trucks") — minimise the truck's own idle wait after travel. Keeps trucks
 * moving; one of the two conflicting classic criteria. */
export const minTruckWait: Policy = (s) => pick(s, (v, t) => waitAtArrival(v, t));

/** 5. Min-shovel-wait ("maximise shovels") — feed the most-starved shovel (least committed work, ignoring the
 * truck's travel). Keeps the expensive shovel fed; the conflicting opposite of #4. */
export const minShovelWait: Policy = (s) => pick(s, (v) => v.freeInSec + backlog(v) * v.loadMeanSec);

export interface PolicyDef { id: string; en: string; es: string; fn: Policy; tier: 'heuristic' | 'criterion' | 'baseline' | 'learned' | 'or'; }
export const POLICIES: PolicyDef[] = [
  { id: 'greedy', en: 'Greedy (earliest completion)', es: 'Greedy (fin más temprano)', fn: greedy, tier: 'heuristic' },
  { id: 'shortestWait', en: 'Shortest expected wait', es: 'Espera esperada mínima', fn: shortestWait, tier: 'heuristic' },
  { id: 'minTruckWait', en: 'Min truck wait (max trucks)', es: 'Mín. espera de camión', fn: minTruckWait, tier: 'criterion' },
  { id: 'minShovelWait', en: 'Min shovel wait (max shovels)', es: 'Mín. espera de pala', fn: minShovelWait, tier: 'criterion' },
  { id: 'fixed', en: 'Fixed assignment', es: 'Asignación fija', fn: fixed, tier: 'baseline' },
  // 6. The OR tier (#22): joint truck→shovel-slot assignment (Hungarian) over the fleet view —
  //    the DISPATCH-style instantaneous optimum, vs the per-truck rules above.
  { id: 'hungarian', en: 'OR — optimal assignment (Hungarian)', es: 'OR — asignación óptima (Hungarian)', fn: hungarianPolicy, tier: 'or' },
];
export const policyById = (id: string): PolicyDef => POLICIES.find((p) => p.id === id) ?? POLICIES[0];
