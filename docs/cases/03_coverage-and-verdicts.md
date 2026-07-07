# 03 · Coverage matrix and the verdict system

This page ties the corpus together: which problem axis each case covers, how the App and Benchmark turn a run
into a **verdict** (not just a number), and how cross-case aggregation works so a policy is judged on the
whole corpus rather than a cherry-picked case.

## Coverage matrix (what binds, and where dispatch matters)

| Axis | Cases | What is exercised | Does dispatch matter? |
|---|---|---|---|
| Match factor (fleet sizing) | C01, C02, C03 | balanced / over-trucked / under-trucked | No (fix the fleet, not the policy) |
| Multi-shovel assignment | C04, C05, C06, C07 | 2 to 4 shovels, symmetric and asymmetric | **Yes** (the core dispatch decision) |
| Road geometry (what binds) | C08, C09 | truck-bound vs shovel-bound (deep vs shallow) | Marginally (geometry dominates) |
| Plant constraint | C10 | crusher cap as the ceiling | Yes (avoid overshoot; feed smoothing) |
| Fleet heterogeneity | C11 | mixed 793F + 930E, bunching | Yes (assignment interacts with speed classes) |
| Determinism | C12 | closed-form 1x1 oracle | N/A (correctness anchor) |

The matrix is deliberately spread so that the "dispatch matters" cases (C05-C07, C10, C11) are surrounded by
cases where it should NOT matter (C01, C04, C08/C09), which is what lets the App state honestly *when* a
policy choice is worth making.

## The verdict system

The App does not just print tonnes; each case carries a **verdict** baked from the deterministic run, so the
reader gets the interpretation, not raw numbers to guess at:

- **TIE** (C01, C04): all policies land within a small tolerance, so the honest report is "dispatch barely
  matters here", not a spurious ranking. A method that reports a win on a TIE case is flagged.
- **Pareto** (C05): two or more policies are non-dominated on the (tonnes, wait) objectives, reported as a
  Pareto front plus a TIE rule, never collapsed to one winner.
- **Oracle** (C12): the run must equal the closed-form value exactly; any drift fails the determinism check.
- **Binding side** (C08/C09/C10): the verdict names the limiting resource (trucks, shovels, or the plant), so
  the user learns *why* throughput is what it is.

## Cross-case aggregation (Experiments and Benchmark)

- The **App** shows one selected case at a time, reactive to the source, policy and control selections.
- **Experiments** runs the match-factor fleet-size sweep and shows the over-trucking knee at MF = 1 (the
  Kneedle detection), which is how MF theory is validated empirically rather than asserted.
- **Benchmark** summarises the whole corpus: per-policy performance across cases, the learned-vs-heuristic
  comparison (reported honestly: the learned RWR / BC-best policies MATCH, they do not beat, their teacher
  heuristics, so there is no fabricated RL win), and the OR/Hungarian tier marked separately. The OR tier is
  honestly excluded from the cross-source agreement statistic with a stated reason, because instantaneous
  optimal assignment is a different object than a myopic policy on a homogeneous fleet (the documented finding
  is that Hungarian ranks 3rd on the corpus, it does not dominate good heuristics).

## Honesty summary

- The Synthetic lane is a deterministic **simulation**, not a real fleet-management system; no real plant data
  is used or claimed in it.
- The Real-sample lane is **structure-real** (real DES physics over a generated or desensitised mine); see
  [02](02_real-sample-lane.md).
- Learned policies are **competitive within ~1% of the best heuristic**, reported as a tie, never as a win.
- Match-factor theory is **validated by the sweep** (the knee at MF = 1), not assumed.

See [`../architecture/06_model-evaluation.md`](../architecture/06_model-evaluation.md) for the full held-out /
Pareto / MF protocol and the per-case `data/derived/manifests/<case>.json` for the numbers behind each verdict.
