// The OR tier's dispatch policy (#22): DISPATCH-style instantaneous OPTIMAL assignment.
// At each decision the policy solves the joint truck→shovel-slot assignment (Hungarian) over the
// fleet view (every truck that will ask for dispatch within the window) and returns THIS truck's
// assigned shovel. Where the fleet view is unavailable (replay/counterfactual contexts build a
// single-truck state), it falls back to solo earliest-completion, stated in the docs: agreement
// numbers for `hungarian` reflect that fallback, tonnes comparisons use the full joint solve.
import { type DispatchState } from '../sim/types';
import { assignFleet } from './hungarian';

function soloEarliestCompletion(s: DispatchState): number {
  let best = s.shovels[0].id, bestT = Infinity;
  for (const v of s.shovels) {
    const t = Math.max(s.travelEmptySec(v.id), v.freeInSec + v.queueLen * v.loadMeanSec) + v.loadMeanSec;
    if (t < bestT) { bestT = t; best = v.id; }
  }
  return best;
}

export function hungarianPolicy(s: DispatchState): number {
  if (!s.fleet?.length || !s.etaEmptySecFor) return soloEarliestCompletion(s);
  const trucks = s.fleet.map((t) => ({ id: t.id, readyInSec: t.readyInSec, atDumpId: t.atDumpId }));
  const shovels = s.shovels.map((v) => ({
    id: v.id,
    // COMMITTED backlog priced into the first slot: queued + already-dispatched inbound trucks
    // (they are not in the pending fleet, but they WILL be served first, omitting inbound
    // re-creates the herding the joint assignment exists to avoid)
    freeInSec: v.freeInSec + (v.queueLen + v.inbound) * v.loadMeanSec,
    loadMeanSec: v.loadMeanSec,
  }));
  const eta = (ti: number, sid: number) => s.etaEmptySecFor!(trucks[ti].id, sid);
  const plan = assignFleet(trucks, shovels, eta, 2);
  return plan.get(s.truck.id) ?? soloEarliestCompletion(s);
}
