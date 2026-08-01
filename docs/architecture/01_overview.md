# 01, Overview

DispatchLab is split into a heavy **offline engine** (`data-pipeline/pipeline/`) and a **frontend SPA** (`frontend/`),
bound by two data contracts. The committed compact artifacts under `data/derived/` are the offline engine's real
outputs and the SPA's replay payload.

```
12 dispatch scenarios (CONTRACT 1) ─► Node DES dataset gen (science/gen_dataset.mjs, the same TS DES) ──► decisions (jsonl, git-ignored)
                                                                                                            │
                                                          torch train policies (science/train_policy.py) ──►├─► dl-policy.onnx, dl-bcbest.onnx ┐
                                                          held-out imitation accuracy ──────────────────────►├─► dl-learned.json                │ data/derived/
                                                 12 cases × policies (science/bake_cases.mjs, the TS DES) ───┴─► case-results.json               ┘ (committed)
                                                                                                            │
per-case replay (pipeline, numpy) ──(CONTRACT 2: core/manifest.py)─► data/derived/<case>/trace.json + manifests/
                                                                                                            │
frontend (copy-data.mjs overlays data/derived) ──► the TS DES + onnxruntime-web run LIVE in the browser
```

## Packages

* **`data-pipeline/pipeline/`**, the offline engine: `io/` (contracts, formats), `core/` (rng, trace, manifest, gate),
  `stages/` (the named pipeline, thin wrappers over the science), `cases/` + `registry.py` (the 12 cases by category),
  `science/` (the preserved verbatim Node DES dataset gen + torch policy training + the case bake, the heavy lane),
  `pipeline.py` (orchestrator + CLI), `live.py` (dormant Pyodide).
* **`frontend/`**, the React/Vite SPA: `src/sim/` (the TS DES engine), `src/policies/` (the 5 heuristics + the
  Hungarian OR tier + the learned policies), `src/lib/ort.ts` (onnxruntime-web), `src/viz/` (PitMap / Pareto / sweep),
  `src/pages/` (the 6 standard pages), `src/lib/contract.types.ts` (the Contract-2 mirror).
* **`app/`**, a dormant FastAPI backend (DispatchLab is static-first).

## The two lanes

* **Default (numpy-only):** `python data-pipeline/run.py all` rebuilds every per-case replay trace + manifest from the
  committed `case-results.json` + `dl-learned.json`, no torch, no Node. A clone replays immediately.
* **Heavy (`--retrain`, two-language):** Node generates the DES decision dataset (the same TS DES the browser runs)
  → torch trains the two learned policies → exports ONNX + dl-learned.json → re-bakes `case-results.json`. Local-only.
