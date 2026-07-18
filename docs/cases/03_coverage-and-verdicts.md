# 03 · Coverage matrix and the verdict system

This page ties the corpus together: which problem axis each case covers, how the App and Benchmark turn a run
into a **verdict** (not just a number), and how cross-case aggregation works so a policy is judged on the
whole corpus rather than a cherry-picked case.

The round-2 corpus is 8 cases: three simple teaching cases (C01-C03, >= 4 shovels, >= 2 destinations) and five
complex / dynamic cases (C04-C08, >= 6 shovels scaling to 12, an actively-cycled ore stockpile, multiple
plants + waste dumps, plus breakdowns / stochastic cycle times / blend windows / phases). Every haul runs
through a single pit exit / portal (shovel -> internal pit roads -> portal -> a direct surface haul ->
destination; the empty return reverses it), and the only material paths are the four domain-correct ones
(shovel-ore -> crusher, shovel-ore -> stockpile rehandle, shovel-waste -> waste dump, and the reclaimer
stockpile -> plant). See [01](01_synthetic-case-corpus.md) for the per-case detail.

## Coverage matrix (what binds, and where dispatch matters)

| Axis | Cases | What is exercised | Does dispatch matter? |
|---|---|---|---|
| Ore vs waste routing | C01, C03 | ore routes to the crusher, waste to the waste dump (the "which dump" decision) | Some (routing is by face type) |
| Multi-plant routing | C02, C06, C08 | two crushers/plants, each with its own feed KPI | **Yes** (which plant, and balance the feeds) |
| Match factor (fleet sizing) | all cases | over / under-trucked read live from each multi-source case, not a 1-shovel toy | No (fix the fleet, not the policy) |
| Pit geometry (what binds) | C04 (deep), C05 (plane) | deep narrow pit (long steep ramps, haul-bound) vs shallow wide pit (short flat roads, shovel-bound) | Marginally (geometry dominates the ceiling) |
| Active stockpile (buffer) | C04, C05, C06, C07, C08 | crusher is the bottleneck, so ore rehandles onto the pile and the reclaimer draws it down | **Yes** (rehandle vs starve the plant) |
| Crusher receiving bays | C04, C05, C07 (2-bay); C02, C06, C08 (1-bay) | a 2-bay crusher tips two trucks in parallel; a slow bay backs the pit up | **Yes** (bay contention drives rehandle) |
| Fleet heterogeneity | C06, C08 | mixed 793F + 930E, payload / speed classes bunch | **Yes** (assignment interacts with speed classes) |
| Breakdowns / stochastic | C04 (stochastic), C06 (breakdown), C08 (both) | Poisson shovel failure + high cycle-time variance | **Yes** (hedge the failing / bunching shovel) |
| Blend window | C07, C08 | crusher grade window binds the ore lane | **Yes** (blend vs throughput) |
| Full network (the boss) | C08 | 12 shovels, 3 phases, 2 plants, 2 waste dumps, a stockpile, all dynamics at once | **Yes** (the recognizably real pit) |
| Determinism | test fixture | closed-form 1x1 oracle (`frontend/test/fixtures.ts`, not a user case) | N/A (correctness anchor) |

The matrix is deliberately spread so that the "dispatch matters" cases (the complex C04-C08) are surrounded by
teaching cases where the decision is simpler (C01-C03), which is what lets the App state honestly *when* a
policy choice is worth making. The **axis-coverage gate** (`frontend/test/axisCoverage.test.ts`) fails the
build if any primitive is left uncovered, if the corpus is not exactly 2-3 simple + all-others-complex, if any
stockpile does not fill to >= 30 % and draw back down in its baked trace, if any route or baked leg is not one
of the four valid material paths, or if two cases share an identical node layout (a templated / distinct-pit
regression).

## The verdict system

The App does not just print tonnes; each case carries a **verdict** baked from the deterministic run, so the
reader gets the interpretation, not raw numbers to guess at:

- **Tie**: all policies land within a small tolerance, so the honest report is "dispatch barely matters here",
  not a spurious ranking. A method that reports a win on a tie case is flagged.
- **Pareto**: two or more policies are non-dominated on the (tonnes, wait) objectives, reported as a Pareto
  front plus a tie rule, never collapsed to one winner.
- **Oracle** (the 1x1 test fixture): the run must equal the closed-form value exactly; any drift fails the
  determinism check. It lives in the test suite, not as a user tile, so no 1-source case ships.
- **Binding side**: the verdict names the limiting resource (trucks, shovels, or the plant / stockpile), so the
  user learns *why* throughput is what it is (deep C04 is haul-bound; plane C05 is shovel-bound).

## Cross-case aggregation (Experiments and Benchmark)

- The **App** shows one selected case at a time, reactive to the source, policy and control selections.
- **Experiments** runs the match-factor fleet-size sweep and shows the over-trucking knee at MF = 1 (the
  Kneedle detection), which is how MF theory is validated empirically rather than asserted.
- **Benchmark** summarises the whole corpus: per-policy performance across cases, the learned-vs-heuristic
  comparison, and the OR / Hungarian tier. The aggregate ranking is read from the baked artifact, not
  hardcoded; on the round-2 corpus (multi-destination routing, stockpile rehandle, heterogeneous fleets) the
  joint Hungarian assignment leads and the behaviour-clone of the best matches it, an honest result reported
  from the data, not a fabricated RL win.

## Honesty summary

- The Synthetic lane is a deterministic **simulation**, not a real fleet-management system; no real plant data
  is used or claimed in it.
- The Real-sample lane is **structure-real** (real DES physics over a generated or desensitised mine); see
  [02](02_real-sample-lane.md).
- Learned policies are reported honestly against their teacher (a match, never a fabricated win).
- Match-factor theory is **validated by the sweep** (the knee at MF = 1), not assumed.

See [`../architecture/06_model-evaluation.md`](../architecture/06_model-evaluation.md) for the full held-out /
Pareto / MF protocol and the per-case `data/derived/manifests/<case>.json` for the numbers behind each verdict.
