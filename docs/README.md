# DispatchLab — documentation wiki

The navigable wiki for DispatchLab (ADR-0056), authored as the product is built. DispatchLab is a public, didactic
**truck-shovel dispatch bench**: a deterministic discrete-event simulation (DES) of an open-pit haul cycle, five
classical dispatch policies + two **learned** ONNX policies, an animated pit map, a multi-objective policy comparison
(Pareto + TIE rule), and a match-factor theory-validation sweep — all running **live in the browser**.

## What it is / what it is NOT

* **Is:** a real, interactive dispatch sandbox — pick one of 8 cases (single-shovel MF sweep, multi-shovel pits, the
  1×1 oracle), run any of 7 policies in the DES, compare them on a Pareto frontier with a TIE rule, and see the
  learned policies recovered from logged DES decisions run live (onnxruntime-web).
* **Is NOT:** a production dispatch system. The DES is a **deterministic simulation**, NOT a real fleet. The two
  learned policies are **competitive** (within ~1% of the best heuristic that taught them), NOT a fabricated RL win.
  No real fleet-management data is used.

## Map

| Folder | What it answers |
|---|---|
| [`architecture/`](architecture/README.md) | the two data contracts, the staged offline pipeline (two-language), the lane gate, determinism, model evaluation, deploy |
| [`frameworks/`](frameworks/README.md) | the binding engines (the TS DES, PyTorch, ONNX/onnxruntime, NumPy) + the method cards (the policies, the learned dispatchers, match factor) |
| [`cases/`](cases/README.md) | the 8-case matrix by category + the oracle + the honesty |
| [`guides/`](guides/README.md) | run the pipeline, regenerate the policies (Node DES + torch), bring your own pit |
| [`../data/README.md`](../data/README.md) | the data contract (Contract 1 scenario schema; Contract 2 artifact layout) |

## The three lanes (at a glance)

1. **Offline (precompute, heavy, two-language)** — a Node DES dataset generator logs decisions; torch trains the two
   learned policies → ONNX. Local-only (`--retrain`); the dataset jsonl is git-ignored.
2. **Live (client-side)** — the TS DES + onnxruntime-web (the learned policies in the decision-inspector), in browser.
3. **Replay (static)** — the committed case-results + dl-learned.json; the default (numpy-only) pipeline rebuilds traces.
