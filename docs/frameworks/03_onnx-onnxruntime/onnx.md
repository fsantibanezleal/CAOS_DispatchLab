# ONNX / onnxruntime / onnxruntime-web

**What:** the portable model format (`onnx==1.22.0`) + the runtimes, `onnxruntime==1.27.0` (offline parity) and
`onnxruntime-web^1.27.0` (the live in-browser inference).
**Why binding:** ONNX is the contract between the heavy torch training lane and the light client-side lane. The
exported `dl-policy.onnx` + `dl-bcbest.onnx` are small and committed under `data/derived/`; `dl-learned.json` carries
the weights for the synchronous TS forward + the `featOrder` encoding contract.

## The version pin (load-bearing)

`frontend/src/lib/ort.ts` pins both the npm package and the WASM CDN to the same version:
```ts
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
ort.env.wasm.numThreads = 1;
```
A drift between the npm version and the `wasmPaths` CDN silently breaks the JS/WASM contract → "Session already
started" / load failures. Runs are serialised per model. The export opset (17) is compatible with onnxruntime-web 1.27.0.

## Two live paths

The learned policies run TWO ways: a synchronous TS forward of the `dl-learned.json` weights inside the DES (so every
view can select them), AND the canonical ONNX via onnxruntime-web in the **decision-inspector** (click a decision →
the live per-shovel scores). Both reproduce the offline encoding.
