// The beyond-SOTA dispatcher: a receding-horizon Monte-Carlo rollout over the discrete-event model itself.
// At each dispatch decision, for every feasible candidate shovel, the current simulation is forked, the
// candidate applied, and the rest of the horizon simulated forward K times under a base policy (the best
// myopic heuristic); the candidate minimising the simulated objective (here: maximising simulated tonnes) is
// chosen. This is one policy-improvement step over the base heuristic (Bertsekas, Tsitsiklis & Wu 1997,
// DOI 10.1023/A:1009635226865): on the deterministic model, with a base policy that is a fixed function of
// state, the one-step rollout is provably no worse than the base on the simulated objective (asserted in
// test/cases23.test.ts). Under cycle-time uncertainty the K samples estimate the expected objective, the
// stochastic-scheduling rollout of Bertsekas & Castanon 1999 (DOI 10.1023/A:1009634810396); the guarantee
// weakens to empirical-with-CI, so the Benchmark reports Monte-Carlo confidence intervals, never a bare win.
//
// Live-browser split (AlphaGo-style): the true rollout is heavy (K x horizon DES steps per decision), so it
// runs offline over the corpus (science/rollout_bench.mjs) and its chosen actions are distilled into a small
// per-shovel MLP -> dl-rollout.onnx, run live via onnxruntime-web exactly like the RWR/BC nets. The live App
// also runs a bounded rollout on demand in the "Rollout inspector" panel (this module), never on autoplay.
import { RolloutSim } from '../sim/rolloutSim';
import { shovelFeats } from './learned';
import { type CaseSpec, type Policy, type DispatchState } from '../sim/types';

export interface RolloutOpts {
  base: Policy;            // base (rollout) policy, the best myopic heuristic
  K: number;               // Monte-Carlo samples per candidate (1 on the deterministic model)
  horizonSec: number;      // receding-horizon look-ahead (Infinity = to shift end)
  lambda: number;          // objective = meanTonnes - lambda * meanWaitH (0 = pure tonnes; keeps the guarantee crisp)
  // Switching margin: DEVIATE from the base action only when a candidate beats the base action's simulated
  // objective by more than this relative margin; otherwise follow the base. This is the standard practical
  // rollout guard, it makes the rollout reduce to its base when the look-ahead sees no robust gain (so it
  // never trades a knife-edge simulated tie for a loss in the realized world). 0 = pure argmax.
  switchMargin: number;
  deterministic: boolean;  // committed run on the mean model (exact improvement guarantee) vs the noisy world
  // Look-ahead MODEL: 'sample' draws K independent futures per candidate (Monte-Carlo rollout, Bertsekas &
  // Castanon 1999); 'mean' plans every branch on the deterministic mean model (CERTAINTY-EQUIVALENT rollout).
  // The mean planner has zero sampling variance, so on the noisy corpus it dominates a small-K Monte-Carlo
  // rollout whose candidate comparison desynchronizes once the forced action perturbs the event order
  // (a measured finding, see science/rollout_bench.mjs and docs/frameworks/07_rollout).
  planModel: 'sample' | 'mean';
}

export const DEFAULT_ROLLOUT: Omit<RolloutOpts, 'base'> = { K: 8, horizonSec: Infinity, lambda: 0, switchMargin: 0.004, deterministic: false, planModel: 'mean' };

const mix = (a: number, b: number, c: number): number => (((Math.imul(a, 2654435761) ^ Math.imul(b, 40503)) ^ Math.imul(c, 2246822519)) >>> 0);

/** Score each candidate by the mean simulated objective over K forked futures (common random numbers). */
function scoreCandidates(sim: RolloutSim, st: DispatchState, opts: RolloutOpts, seed: number, k: number):
  { id: number; score: number; meanTonnes: number; meanWaitH: number; samples: { tonnes: number; waitH: number }[] }[] {
  const horizonEnd = Math.min(st.now + opts.horizonSec, sim.c.shiftSec);
  const meanPlan = opts.planModel === 'mean';
  const K = (opts.deterministic || meanPlan) ? 1 : Math.max(1, opts.K);
  return st.shovels.map((v) => {
    const samples: { tonnes: number; waitH: number }[] = [];
    let accT = 0, accW = 0;
    for (let s = 0; s < K; s++) {
      // 'mean': plan the branch on the deterministic mean model (zero sampling variance). 'sample': draw an
      // independent future, reseeded INDEPENDENTLY of the candidate (common random numbers across candidates);
      // the rollout estimates E[objective] under noise whose realization it cannot see.
      const branch = sim.fork(meanPlan ? true : undefined);
      if (!meanPlan && !opts.deterministic) branch.reseedFutures(mix(seed, k, s + 1));
      branch.runToNextDecision(sim.c.shiftSec);   // re-resolve the cloned pending decision (rebuilds closures)
      branch.commit(v.id);                          // apply this candidate
      const obj = branch.runWithPolicy(opts.base, horizonEnd);
      accT += obj.tonnes; accW += obj.waitH; samples.push(obj);
    }
    const meanTonnes = accT / K, meanWaitH = accW / K;
    return { id: v.id, score: meanTonnes - opts.lambda * meanWaitH, meanTonnes, meanWaitH, samples };
  });
}

/** Pick the rollout action: the argmax candidate, but only if it beats the BASE action's simulated score by
 *  more than `switchMargin` (relative); otherwise follow the base. Deterministic tie-break by lowest id. */
function pickBest(scored: { id: number; score: number }[], baseId: number, switchMargin: number): number {
  let best = scored[0];
  for (const c of scored) if (c.score > best.score + 1e-9 || (Math.abs(c.score - best.score) <= 1e-9 && c.id < best.id)) best = c;
  const baseScore = scored.find((c) => c.id === baseId)?.score ?? -Infinity;
  const margin = Math.abs(baseScore) * switchMargin;
  return best.score > baseScore + margin + 1e-9 ? best.id : baseId;
}

export interface RolloutLog { feats: number[][]; chosen: number; nSh: number; }
export interface RolloutRunResult { tonnes: number; waitH: number; log: RolloutLog[]; }

/** Run the full committed rollout trajectory over a case; returns the outcome + the logged (state, action)
 *  pairs used to DISTILL the live dl-rollout.onnx. */
export function runRollout(c: CaseSpec, seed: number, opts: RolloutOpts): RolloutRunResult {
  const sim = new RolloutSim(c, seed, { deterministic: opts.deterministic });
  const log: RolloutLog[] = [];
  let k = 0;
  for (;;) {
    const st = sim.runToNextDecision(c.shiftSec);
    if (!st) break;
    const scored = scoreCandidates(sim, st, opts, seed, k);
    const chosen = pickBest(scored, opts.base(st), opts.switchMargin);
    const feats = st.shovels.map((v) => shovelFeats(v, st.travelEmptySec(v.id)));
    log.push({ feats, chosen: st.shovels.findIndex((v) => v.id === chosen), nSh: st.shovels.length });
    sim.commit(chosen);
    k++;
  }
  return { tonnes: sim.tonnes, waitH: sim.waitH, log };
}

export interface CandidateInspect {
  id: number; name: string; score: number; meanTonnes: number; meanWaitH: number;
  samples: { tonnes: number; waitH: number }[]; chosen: boolean; base: boolean;
}
export interface InspectResult { decisionIndex: number; nowSec: number; truckId: number; candidates: CandidateInspect[]; K: number; horizonSec: number; }

/** Compute the K simulated futures per candidate at ONE decision (the `decisionIndex`-th), for the live
 *  Rollout inspector panel. Bounded (small K, short horizon), on-demand, never on autoplay. */
export function rolloutInspect(c: CaseSpec, seed: number, opts: RolloutOpts, decisionIndex: number): InspectResult | null {
  const sim = new RolloutSim(c, seed, { deterministic: opts.deterministic });
  let k = 0;
  for (;;) {
    const st = sim.runToNextDecision(c.shiftSec);
    if (!st) return null;
    if (k === decisionIndex) {
      const scored = scoreCandidates(sim, st, opts, seed, k);
      const baseChoice = opts.base(st);
      const chosen = pickBest(scored, baseChoice, opts.switchMargin);
      const candidates: CandidateInspect[] = scored.map((s) => ({
        id: s.id, name: st.shovels.find((v) => v.id === s.id)?.spec.name ?? `Shovel ${s.id}`,
        score: s.score, meanTonnes: s.meanTonnes, meanWaitH: s.meanWaitH, samples: s.samples,
        chosen: s.id === chosen, base: s.id === baseChoice,
      }));
      return { decisionIndex, nowSec: st.now, truckId: st.truck.id, candidates, K: opts.deterministic ? 1 : opts.K, horizonSec: opts.horizonSec };
    }
    // advance using the base policy (cheap) until we reach the target decision
    sim.commit(opts.base(st));
    k++;
  }
}
