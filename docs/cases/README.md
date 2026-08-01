# Cases, taxonomy & coverage matrix

`data-pipeline/pipeline/cases/dispatch_cases.py` defines 8 multi-source / multi-destination cases, mirroring the
SPA's `src/sim/cases.ts`. The corpus is **three simple teaching cases** (C01-C03: >= 4 shovels, >= 2
destinations, routing + match factor + the multi-plant decision) and **five complex / dynamic cases** (C04-C08:
>= 6 shovels scaling to 12, an actively-cycled ore stockpile, multiple plants + waste dumps, plus breakdowns /
stochastic cycle times / blend windows / phases). C08 is the 12-shovel, 3-phase boss (the default case). There
is no 1-source tile; the closed-form 1x1 oracle lives as a test fixture (`frontend/test/fixtures.ts`).

Every haul runs through a single pit exit / portal: a loaded truck goes shovel -> internal pit roads -> portal
-> a direct surface haul -> destination, and the empty return reverses it (destination -> portal -> pit roads
-> shovel), always on drawn roads. The only material paths are the four domain-correct ones: shovel-ore ->
crusher, shovel-ore -> stockpile (rehandle), shovel-waste -> waste dump, and the reclaimer stockpile -> plant
(a conveyor, not a truck). The App shows one selected case; Experiments / Benchmark show cross-case summaries.
All results are deterministic DES-simulation outputs, not a real plant.

## Deep pages

1. [The synthetic case corpus](01_synthetic-case-corpus.md), the 8 cases in full (config, asserted expected
   band, validation anchor), the multi-source / multi-destination network model, the pit-portal + internal-road
   layout, and the material-flow model.
2. [The real-sample lane](02_real-sample-lane.md), the `Synthetic | Real sample` Source selector: the
   `cyclelog/v1` contract, the `minehaulsim` structure-real samples (+ geology via oreblocks), the legacy
   OpenMines Huolinhe samples, the counterfactual re-decision, and the honest structure-real boundary.
3. [Coverage matrix and the verdict system](03_coverage-and-verdicts.md), what binds in each case, how the
   App turns a run into a verdict (tie / Pareto / oracle / binding-side), and how Benchmark aggregates.

The quick-reference taxonomy table follows.

| Tier | Case ids | What they exercise |
|---|---|---|
| **Simple teaching (routing + match factor)** | C01 (ore + waste routing, shallow pit), C02 (two plants, independent feeds), C03 (asymmetric roads, dispatch matters) | >= 4 shovels, >= 2 destinations kept simple: the "which dump" decision by face type, the two-plant balance, and the haul-asymmetry case where a look-ahead does real work |
| **Complex / dynamic network (active stockpile)** | C04 (deep narrow pit, stochastic cycles), C05 (shallow wide pit, shovel-bound), C06 (two-plant, breakdown + mixed fleet), C07 (crusher-limited blend, heavy rehandle) | >= 6 shovels, a crusher tuned as the bottleneck so ore constantly rehandles onto the stockpile and the reclaimer draws it back down; deep vs plane geometry (haul-bound vs shovel-bound), a Poisson breakdown, a mixed 793F + 930E fleet, blend windows and shift breaks |
| **The boss (full network)** | C08 (12 shovels, 3 phases, 2 plants, 2 waste dumps, a stockpile, mixed fleet, breakdown, blend, break) | every node type + every dynamic at once, a recognizably real open-pit network |
| **oracle control (test fixture)** | `FX_ORACLE` (1x1) | throughput = floor(shift/cycle).payload exactly, the determinism check, in the test suite, not a user tile |

## The controls

* **Tie verdicts:** on a balanced / symmetric pit the policies tie at ~equal tonnes and dispatch barely matters;
  a method claiming a big win there is suspect. The symmetric-tie fixture (`FX_TIE`) is the pure control.
* **1x1 oracle (`FX_ORACLE`):** the closed-form throughput must match exactly, proving the DES timeline is
  correct. It is a test fixture so the shipped corpus carries no 1-source case.
* **Pareto verdicts:** an asymmetric case where different policies are non-dominated on (tonnes, wait), reported
  as a Pareto front + a tie rule, not a single winner. The asymmetric positive-control fixture (`FX_POS`) is
  where the look-ahead rollout provably beats its myopic base.

## Honesty

* The DES is a **deterministic simulation**, not a real fleet-management system. No real plant data is used or claimed.
* The learned policies are reported honestly against their teacher heuristic (a match, never a fabricated RL
  win). The Benchmark aggregate ranking is read from the baked artifact, not hardcoded.
* Match-factor theory is validated by the fleet-size sweep (the over-trucking knee at MF=1), not assumed.

See [`../architecture/06_model-evaluation.md`](../architecture/06_model-evaluation.md) for the held-out + Pareto + MF
protocol, and the per-case `data/derived/manifests/<case>.json` for the numbers.
