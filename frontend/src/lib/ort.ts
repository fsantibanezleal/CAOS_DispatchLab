// Live in-browser inference of the learned dispatch policies' ONNX models (the same nets trained offline).
// The DES runs the synchronous TS forward of the weights; this runs the canonical .onnx via onnxruntime-web
// in the Decision-inspector view, scoring each candidate shovel from its features (parity with the TS path).
import * as ort from 'onnxruntime-web';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
ort.env.wasm.numThreads = 1;   // GitHub Pages has no COOP/COEP → single-threaded WASM

const sessions: Record<string, Promise<ort.InferenceSession>> = {};
const base = () => (import.meta.env.BASE_URL || '/');
const get = (name: string) => (sessions[name] ??= ort.InferenceSession.create(`${base()}${name}`, { executionProviders: ['wasm'] }));

// onnxruntime-web forbids concurrent run() on one session ("Session already started"), which StrictMode's
// double-fired effects + the playback re-renders can trigger, so serialise the calls per model.
const locks: Record<string, Promise<unknown>> = {};

/** Score each candidate shovel (per-shovel 6-feature rows) with a learned policy's ONNX model. */
export async function onnxScore(model: 'dl-policy.onnx' | 'dl-bcbest.onnx' | 'dl-rollout.onnx', feats: number[][]): Promise<number[]> {
  const s = await get(model);
  const prev = locks[model] || Promise.resolve();
  const run = prev.then(async () => {
    const n = feats.length, flat = Float32Array.from(feats.flat());
    const out = await s.run({ feats: new ort.Tensor('float32', flat, [n, 6]) });
    return Array.from(out.score.data as Float32Array);
  });
  locks[model] = run.catch(() => {});
  return run;
}
