"""Stage 5, evaluate (the TEST stage, heavy lane): the held-out imitation accuracy of the learned policies vs their
teachers, and the HONEST learned-vs-heuristic comparison (mean tonnes, the learned policies are COMPETITIVE, within
~1%, NOT a fabricated win). Plus the per-case multi-policy DES comparison (`science/bake_cases.mjs` -> case-results.json).
Leakage-safe by a by-scene split. Metrics land in dl-learned.json; invoked by `pipeline.retrain`."""
