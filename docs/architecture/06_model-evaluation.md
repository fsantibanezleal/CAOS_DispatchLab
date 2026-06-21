# 06 — Model evaluation

## The held-out imitation accuracy

The two learned policies are trained on logged DES decisions and evaluated on **held-out** decisions (a by-scene
split → no decision leaks across the boundary). `dl-learned.json` carries `policyImitAcc` (reward-weighted imitation),
`bcBestImitAcc` (behaviour-clone of the best heuristic), `bcBestSelfAcc`, `bestPolicy`, `nTrain`, `nEval` — the real
numbers, rendered on the Benchmark page.

## The honest learned-vs-heuristic comparison

The learned policies are **COMPETITIVE — within ~1%, matching the best heuristic** (their teacher, e.g. RWR 84.4k vs
shortest-wait 84.9k on C06) — NOT beating it, and the Benchmark page says so. There is no fabricated RL win; the value
is a single fast learned dispatcher recovered from data + live inference. Reporting it as a tie when it is a tie is
the honesty bar.

## The multi-objective comparison (Pareto + TIE rule)

`compare.ts` runs every policy over a seed set and reports DISTRIBUTIONS, not a single number: a Pareto scatter
(tonnes ↑-better vs truck-wait ←-better) with the non-dominated frontier, and a **TIE rule** — a rival whose tonnes
band overlaps the leader's is "not significant" (no overconfident winner). On a balanced pit (C01/C04) all policies
TIE; on an asymmetric pit (C05) a genuine Pareto trade-off emerges. case-results.json bakes this per case.

## The oracle control

C12 (1 truck, 1 shovel) is a closed-form **oracle**: throughput must equal `floor(shift / cycle) · payload` exactly —
the determinism check that the DES timeline is correct, not just plausible.

## Match-factor validation

The fleet-size sweep (`sweep.ts`) plots measured throughput against closed-form match-factor theory: throughput scales
~linearly while MF<1 then SATURATES as MF crosses 1 — the over-trucking knee (Kneedle) lands at MF=1. The simulator
reproduces match-factor theory, not just a pretty curve.
