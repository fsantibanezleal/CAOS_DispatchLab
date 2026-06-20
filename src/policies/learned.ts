// Learned dispatch policies — a synchronous TS forward of the small per-shovel scoring nets trained offline
// (tools/dispatch-rl). The DES is synchronous, so the policy runs the net in-line at each decision; the
// canonical artifact is the ONNX export (onnxruntime-web runs it live in the Decision-inspector view, same
// weights). The per-shovel feature encoding MUST match tools/dispatch-rl/gen_dataset.mjs exactly.
import { type Policy, type DispatchState, type ShovelView } from '../sim/types';

export interface Layer { W: number[][]; b: number[] }
export interface LearnedWeights { policy: Layer[]; bcbest: Layer[] }

/** per-shovel features (identical to the training encoder). */
export function shovelFeats(v: ShovelView, travelSec: number): number[] {
  const backlog = v.queueLen + v.inbound + (v.loading ? 1 : 0);
  return [v.queueLen, v.inbound, v.loading ? 1 : 0, v.freeInSec / 300, (backlog * v.loadMeanSec) / 300, travelSec / 300];
}

/** MLP forward: Linear→ReLU→Linear→ReLU→Linear → scalar score. */
export function score(x: number[], layers: Layer[]): number {
  let a = x;
  for (let li = 0; li < layers.length; li++) {
    const { W, b } = layers[li];
    const out = W.map((row, j) => row.reduce((s, w, k) => s + w * a[k], 0) + b[j]);
    a = li < layers.length - 1 ? out.map((v) => Math.max(0, v)) : out;
  }
  return a[0];
}

/** Build a Policy that scores each shovel with the net and picks the argmax (deterministic tie-break by id). */
export function makeLearnedPolicy(layers: Layer[]): Policy {
  return (s: DispatchState) => {
    let best = s.shovels[0].id, bestSc = -Infinity;
    for (const v of s.shovels) {
      const sc = score(shovelFeats(v, s.travelEmptySec(v.id)), layers);
      if (sc > bestSc + 1e-9 || (Math.abs(sc - bestSc) <= 1e-9 && v.id < best)) { bestSc = sc; best = v.id; }
    }
    return best;
  };
}
