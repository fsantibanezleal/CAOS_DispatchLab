"""Stage 3 — train (OFFLINE, heavy lane): fit the two learned dispatch policies on the logged DES decisions — a
reward-weighted imitation policy (dl-policy) + a behaviour-clone of the best heuristic (dl-bcbest) — and export them
to ONNX. Deterministic (seeded). Delegates to `dlab/science/train_policy.py` (torch), invoked by `pipeline.retrain`."""
