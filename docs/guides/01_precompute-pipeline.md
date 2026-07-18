# 01, Regenerate the policies (`--retrain`, two-language)

The heavy lane reproduces `dl-policy.onnx`, `dl-bcbest.onnx`, `dl-learned.json`, and `case-results.json`, from the
same TS DES the browser runs. Local-only (CI never retrains). Deterministic.

```bash
# 1) install the heavy engines (torch CPU + onnx) into .venv-pipeline (also needs Node 20+)
./scripts/setup.sh --precompute        # (PowerShell:  ./scripts/setup.ps1 -Precompute)

# 2) Node DES dataset -> torch train policies -> export ONNX/dl-learned -> re-bake case-results -> rebuild replay
./scripts/precompute.sh all --retrain
```

What runs (`pipeline.retrain`):
1. `node --import tsx data-pipeline/dlab/science/gen_dataset.mjs`, run the TS DES across the cases, logging each
   shovel-assignment decision (features + chosen action + episode tonnes) → a decision dataset (jsonl, git-ignored).
2. `python data-pipeline/dlab/science/train_policy.py`, fit the two learned policies (reward-weighted imitation +
   BC-best) → `dl-policy.onnx` + `dl-bcbest.onnx` + `dl-learned.json` (held-out imitation accuracy + weights).
3. `node --import tsx data-pipeline/dlab/science/bake_cases.mjs`, the per-case multi-policy comparison → `case-results.json`.

Expect the held-out imitation accuracy + the learned-vs-heuristic tonnes to match the committed `dl-learned.json`
(determinism). CPU-fast (seconds + the DES). No GPU (see `docs/frameworks/02_pytorch`).
