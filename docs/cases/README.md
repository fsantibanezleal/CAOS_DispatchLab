# Cases, taxonomy & coverage matrix

`data-pipeline/dlab/cases/dispatch_cases.py` defines 12 cases across 4 categories. The App shows one selected case;
Experiments/Benchmark show cross-case summaries by category. Each case mirrors the SPA's `src/sim/cases.ts`. All
results are deterministic DES-simulation outputs, NOT a real plant.

## Deep pages

1. [The synthetic case corpus](01_synthetic-case-corpus.md), the 12 cases in full (config, asserted expected
   band, validation anchor) grouped by the four axes, and why the corpus is control-heavy (C01/C04 tie, C05
   Pareto, C12 oracle).
2. [The real-sample lane](02_real-sample-lane.md), the `Synthetic | Real sample` Source selector: the
   `cyclelog/v1` contract, the `minehaulsim` structure-real samples (+ geology via oreblocks), the legacy
   OpenMines Huolinhe samples, the counterfactual re-decision, and the honest structure-real boundary.
3. [Coverage matrix and the verdict system](03_coverage-and-verdicts.md), what binds in each case, how the
   App turns a run into a verdict (tie / Pareto / oracle / binding-side), and how Benchmark aggregates.

The quick-reference taxonomy table follows.

| Category | Case ids | What they exercise |
|---|---|---|
| **single-shovel match-factor (the MF sweep)** | C01 (MF≈1), C02 (over-trucked MF≈2), C03 (under-trucked MF≈0.5) | the match-factor regime: balanced → all policies tie; over → shovel-bound saturation; under → shovel idle |
| **multi-shovel dispatch (the policy decision)** | C04 (2-shovel symmetric), C05 (2-shovel asymmetric), C06 (3-shovel), C07 (4-shovel) | where dispatch matters: a genuine Pareto trade-off (C05), and the multi-way learned decision (C06/C07) |
| **geometry & constraints (the #22 physics axes)** | C08 (deep, long 8% ramps), C09 (shallow, short flat), C10 (crusher-limited, baked `crusherMaxTph`), C11 (mixed 793F+930E fleet) | which resource BINDS and why: rimpull-dominated cycles (truck-bound) vs service-dominated (shovel-bound); the plant as the ceiling (committed-in-flight gating, never overshoot); heterogeneous-fleet bunching. Expected bands are ASSERTED in `frontend/test/cases23.test.ts`, not assumed |
| **oracle control (closed-form check)** | C12 (1×1 oracle) | throughput = floor(shift/cycle)·payload EXACTLY, the determinism check |

## The controls

* **C01 / C04 (tie controls):** on a balanced pit all five policies tie at ~equal tonnes, dispatch barely matters; a
  method claiming a big win here is suspect. case-results bakes the TIE verdict.
* **C12 (oracle):** the closed-form 1×1 throughput must match exactly, proves the DES timeline is correct.
* **C05 (Pareto control):** an asymmetric pit where greedy maxes tonnes, min-truck-wait minimises wait, and fixed is
  dominated, a real multi-objective trade-off, reported as a Pareto front + a TIE rule, not a single winner.

## Honesty

* The DES is a **deterministic simulation**, NOT a real fleet-management system. No real plant data is used or claimed.
* The two learned policies are **competitive, within ~1% of the best heuristic** (their teacher), NOT a fabricated RL
  win. The Benchmark page reports the tie honestly.
* Match-factor theory is validated by the fleet-size sweep (the over-trucking knee at MF=1), not assumed.

See [`../architecture/06_model-evaluation.md`](../architecture/06_model-evaluation.md) for the held-out + Pareto + MF
protocol, and the per-case `data/derived/manifests/<case>.json` for the numbers.
