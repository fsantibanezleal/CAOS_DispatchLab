# 05, The staged precompute pipeline (two-language)

`data-pipeline/dlab/stages/`, six named steps. The offline lane is **two-language**: a Node generator logs decisions
by running the same TypeScript DES (no Python re-port, a re-port would diverge from the live engine), then Python
fits the ONNX policies. The real science is preserved verbatim in `dlab/science/`; the stage modules name the steps
and `pipeline.retrain` orchestrates them.

| Stage | What it does | Deps |
|---|---|---|
| `preprocess` | generate the labelled decision dataset by running the TS DES + logging each shovel-assignment + the heuristic action + the episode tonnes (`science/gen_dataset.mjs`) | Node + tsx |
| `feature_extraction` | the per-shovel decision features (queue/backlog/wait/distance), the single source of truth the web reproduces | (in the dataset gen + train_policy) |
| `train` | fit the two learned policies, reward-weighted imitation (dl-policy) + behaviour-clone of the best heuristic (dl-bcbest), and export to ONNX (`science/train_policy.py`) | torch |
| `infer` | run the learned policies in the DES (synchronous TS forward) + via onnxruntime-web | torch / ts |
| `evaluate` | held-out imitation accuracy + the honest learned-vs-heuristic tonnes; the per-case multi-policy comparison (`science/bake_cases.mjs` → case-results.json) | torch / ts |
| `export` | write the ONNX policies + dl-learned.json + case-results.json (the heavy science); build the per-case replay traces + manifests (the light `export.build_replay`) | torch (models) / numpy (replay) |

`pipeline.py` orchestrates them. The **default** invocation only runs the light replay path over the committed
`case-results.json`; `--retrain` runs the Node generator + torch training + the re-bake.

## The labels come from the DES, not a plant

The decisions are logged from the deterministic DES across the cases (2/3/4 shovels), so the learned policies imitate
the heuristics' choices on a real, reproducible decision distribution, and honestly emulate them (competitive, not a
fabricated RL win). A by-scene split keeps the held-out evaluation leakage-safe.
