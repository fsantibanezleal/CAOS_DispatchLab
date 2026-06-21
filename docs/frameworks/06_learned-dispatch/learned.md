# Method — learned dispatch policies (imitation from logged DES decisions)

**What:** two learned dispatch policies recovered from the deterministic DES's own decisions — a single fast
dispatcher that runs live (no per-decision optimisation), measured HONESTLY against the heuristics that taught it.

* **dl-policy** — **reward-weighted imitation**: imitate the heuristic choices, weighting each logged decision by the
  episode reward (tonnes), so the policy leans toward the decisions that led to better shifts.
* **dl-bcbest** — **behaviour cloning** of the single best heuristic (greedy), the simplest imitation baseline.

## Training (`science/train_policy.py`)

The Node DES generator (`gen_dataset.mjs`) logs ~tens of thousands of real decisions across the 2/3/4-shovel cases
(per-shovel features + the chosen action + the episode tonnes). torch fits small nets (seeded), exports
`dl-policy.onnx` + `dl-bcbest.onnx`, and writes `dl-learned.json` (the held-out imitation accuracy + the weights +
`featOrder`). A by-scene split keeps the evaluation leakage-safe.

## The honesty bar

The learned policies are **competitive — within ~1%, matching the best heuristic** (e.g. RWR 84.4k vs shortest-wait
84.9k on C06) — NOT beating it. The Benchmark page states this plainly; there is no fabricated RL win. The value is a
single fast learned dispatcher recovered from data + live in-browser inference, not a claimed optimum.

## Why it fits

Per-decision OR (Hungarian / LP) is optimal but heavy; a learned policy distils the heuristics into one fast forward
pass that runs live in the DES — the right trade for an interactive bench, with the honest caveat that it ties rather
than beats its teacher on these cases.
