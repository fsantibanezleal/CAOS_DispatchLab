// Loads the two learned dispatch policies (trained offline, tools/dispatch-rl) by fetching their committed
// weights and wrapping them as PolicyDefs so they appear alongside the heuristics on every view. The ONNX
// files (dl-policy.onnx / dl-bcbest.onnx) are the canonical artifact + the onnxruntime-web live-inference
// path; the DES runs the synchronous TS forward of the same weights.
import { type PolicyDef } from './heuristics';
import { makeLearnedPolicy, type LearnedWeights } from './learned';

let cache: Promise<PolicyDef[]> | null = null;

export function loadLearnedPolicies(): Promise<PolicyDef[]> {
  if (cache) return cache;
  cache = (async () => {
    const base = import.meta.env.BASE_URL || '/';
    const data = await fetch(`${base}dl-learned.json`).then((r) => r.json());
    const w: LearnedWeights = data.weights;
    const defs: PolicyDef[] = [
      { id: 'rwr', en: 'Learned, RWR policy', es: 'Aprendida, política RWR', fn: makeLearnedPolicy(w.policy), tier: 'learned' },
      { id: 'bcbest', en: 'Learned, BC-best', es: 'Aprendida, BC-best', fn: makeLearnedPolicy(w.bcbest), tier: 'learned' },
    ];
    // the beyond-SOTA tier: the distilled Monte-Carlo rollout dispatcher (imitates the offline rollout at
    // onnxruntime-web speed). Its true offline numbers + the improvement bound live on the Benchmark page.
    if (w.rollout) defs.push({ id: 'rollout', en: 'Rollout (distilled)', es: 'Rollout (destilada)', fn: makeLearnedPolicy(w.rollout), tier: 'rollout' });
    return defs;
  })();
  return cache;
}

export interface LearnedMeta { policyImitAcc: number; bcBestImitAcc: number; bcBestSelfAcc: number; bestPolicy: string; nTrain: number; nEval: number }
let metaCache: Promise<LearnedMeta> | null = null;
export function loadLearnedMeta(): Promise<LearnedMeta> {
  if (metaCache) return metaCache;
  const base = import.meta.env.BASE_URL || '/';
  metaCache = fetch(`${base}dl-learned.json`).then((r) => r.json());
  return metaCache;
}
