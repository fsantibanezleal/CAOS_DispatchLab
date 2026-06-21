# data-pipeline/ — the offline engine (`dlab`)

The staged, seeded, contract-bounded offline pipeline for DispatchLab (ADR-0057). Install editable from the repo root
(`pip install -e .`); run with `python -m dlab.pipeline`.

```
dlab/
├─ __init__.py            # __version__ = "0.05.000"
├─ pipeline.py            # orchestrator + CLI (light replay by default; --retrain runs the two-language heavy lane)
├─ registry.py            # cases grouped by CATEGORY (single-shovel MF / multi-shovel / oracle)
├─ live.py                # Pyodide live-lane entrypoint — DORMANT (the live lane is the TS DES + onnxruntime-web)
├─ io/      contract.py (CONTRACT 1: dispatch-scenario schema + outlier policy) · schema.py · formats.py
├─ core/    rng.py · trace.py (CONTRACT 2 trace) · manifest.py (CONTRACT 2) · gate.py (lane gate)
├─ stages/  preprocess · feature_extraction · train · infer · evaluate · export — thin wrappers over science/
├─ cases/   dispatch_cases.py (the 8 cases C01-C07 + C12 oracle)
└─ science/ gen_dataset.mjs (Node: log DES decisions) · train_policy.py (torch: fit the learned policies -> ONNX) ·
            bake_cases.mjs (the per-case multi-policy comparison -> case-results.json) — the preserved verbatim heavy
            lane (ruff-excluded; run only via --retrain)
```

**Two lanes:**

* **Default (light, numpy-only)** — `python -m dlab.pipeline all` rebuilds every per-case replay trace + manifest
  from the committed `case-results.json` + `dl-learned.json`. No torch, no Node — a clone replays.
* **Heavy (`--retrain`, two-language)** — `pipeline all --retrain` runs the **Node DES dataset generator**
  (`science/gen_dataset.mjs`, the SAME TS DES — no Python re-port) → torch trains the two learned policies
  (`science/train_policy.py`) → exports ONNX + dl-learned.json, then re-bakes `case-results.json`. Needs the
  `--precompute` setup (torch) + Node 20+. See `docs/guides/01_precompute-pipeline.md`.
