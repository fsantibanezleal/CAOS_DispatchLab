# 06, Model evaluation

## The held-out imitation accuracy

The two learned policies are trained on logged DES decisions and evaluated on **held-out** decisions (a by-scene
split → no decision leaks across the boundary). `dl-learned.json` carries `policyImitAcc` (reward-weighted imitation),
`bcBestImitAcc` (behaviour-clone of the best heuristic), `bcBestSelfAcc`, `bestPolicy`, `nTrain`, `nEval`, the real
numbers, rendered on the Benchmark page.

## The honest learned-vs-heuristic comparison

The learned policies are **competitive, within ~1%, matching the best heuristic** (their teacher, e.g. RWR 84.4k vs
shortest-wait 84.9k on C06), not beating it, and the Benchmark page says so. There is no fabricated RL win; the value
is a single fast learned dispatcher recovered from data + live inference. Reporting it as a tie when it is a tie is
the honesty bar.

## The multi-objective comparison (Pareto + tie rule)

`compare.ts` runs every policy over a seed set and reports distributions, not a single number: a Pareto scatter
(tonnes ↑-better vs truck-wait ←-better) with the non-dominated frontier, and a **tie rule**, a rival whose tonnes
band overlaps the leader's is "not significant" (no overconfident winner). On a balanced / symmetric pit all policies
tie; on an asymmetric case a genuine Pareto trade-off emerges. case-results.json bakes this per case.

## The oracle control

The 1x1 oracle fixture (1 truck, 1 shovel; `frontend/test/fixtures.ts`, not a shipped user case) is a closed-form
**oracle**: throughput must equal `floor(shift / cycle) · payload` exactly, the determinism check that the DES
timeline is correct, not just plausible. Keeping it as a test fixture is why the shipped corpus carries no
1-source tile.

## Match-factor validation

The fleet-size sweep (`sweep.ts`) plots measured throughput against closed-form match-factor theory: throughput scales
~linearly while MF<1 then saturates as MF crosses 1, the over-trucking knee (Kneedle) lands at MF=1. The simulator
reproduces match-factor theory, not just a pretty curve.
