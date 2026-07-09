# 01 · The synthetic case corpus

The Synthetic lane runs a fixed corpus of **16 deterministic DES cases**, defined once in
`data-pipeline/dlab/cases/dispatch_cases.py` and mirrored byte-for-byte by the SPA in
`frontend/src/sim/cases.ts`. A real truck-shovel problem is **multi-source and multi-destination with
intermediate buffers**, so the corpus is built to that shape, not to a single straight haul:

- **>= 4 shovels is the FLOOR.** The only sub-4 cases are the labelled didactic **controls** (the
  single-shovel match-factor sweep C01-C03 and the 1x1 oracle C12), which exist to pin correctness.
- **Ore routes to a crusher, waste to a waste dump**, by face type; C07 runs **two crushers**, each with
  its own feed KPI, with ore routed to the nearest plant.
- **Crushers have 1-2 receiving bays** (a bay is a c-server: a 2-bay crusher tips two trucks in parallel).
- **Stockpiles** stage ore through a finite-capacity buffer: an ore truck **rehandles** onto the pile when
  the crusher is backed up (all bays busy + a queue), and a **reclaimer** draws the pile down to feed the
  crusher when the pit cannot. A stockpile is a **SINK that becomes a SOURCE**.
- **C11 and C14 run a heterogeneous 793F + 930E fleet** (the mixed match factor).

Every "expected band" below is an **asserted** test, not a claim: it is checked in
`frontend/test/cases23.test.ts`, and the **axis-coverage gate** (`frontend/test/axisCoverage.test.ts`) fails
the build if any primitive {>=4 shovels, multi-dump, waste dump, multiple crushers, stockpile+reclaim,
crusher-bays 1&2, mixed fleet} is not exercised by at least one case, so the corpus can never silently
regress to a shovels -> one-crusher toy.

All results are outputs of a deterministic discrete-event simulation. **No real plant data is used or
claimed in this lane** (the Real-sample lane is separate, see [02](02_real-sample-lane.md)).

## Controls (intentionally sub-4; they pin correctness)

The match factor is the ratio of hauling capacity to loading capacity:

$$\mathrm{MF} = \frac{N_t \, t_L}{N_s \, T_c}$$

with `N_t` trucks, `N_s` shovels, `t_L` the load time and `T_c` the truck cycle time. `MF = 1` is the
theoretical balance point; below it the shovel starves, above it trucks queue and throughput saturates.

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C01** | 1 shovel, 4 trucks (MF ~ 1) | all policies **TIE** at ~equal tonnes; dispatch barely matters on a balanced pit | match-factor optimum (MF = 1) |
| **C02** | 1 shovel, 8 trucks (MF ~ 2) | **shovel-bound**: throughput saturates, large truck wait; dispatch cannot fix over-trucking | over-trucking knee (Kneedle @ MF = 1) |
| **C03** | 1 shovel, 2 trucks (MF ~ 0.5) | **shovel idle**: throughput scales ~linearly, low truck wait; add trucks, not dispatch | under-trucked regime (MF < 1) |
| **C12** | 1 truck, 1 shovel | throughput = `floor(shift / cycle) . payload` **EXACTLY** | closed-form 1x1 oracle (exact) |

C01 is a **tie control**: a method that claims a large win on a balanced pit is suspect. C12 is the
**determinism anchor** for the entire simulator: with one truck and one shovel there is no queueing and no
dispatch decision, so the DES must reproduce the closed-form throughput to the tonne.

## Multi-shovel dispatch (>= 4 shovels)

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C04** | 4 shovels, 16 trucks, symmetric roads | all policies **TIE**; the look-ahead must equal its base **EXACTLY** | symmetric four-shovel tie control |
| **C05** | 4 shovels, 12 trucks, strong asymmetry, 2-bay plant | greedy over-loads the near shovel; the look-ahead **STRICTLY beats** the base (real dispatch gain) | asymmetric positive control (rollout > base) |
| **C06** | 4 shovels (2 ore + 2 waste), crusher + waste dump | **two destinations**: ore to the crusher, waste to the waste dump; the decision gains "which dump" | multi-destination routing (ore vs waste) |
| **C07** | 4 shovels, 18 trucks, **two crushers** | each shovel's ore routes to the **nearest** plant; each plant carries its own feed KPI | multiple-crusher routing + per-plant feed |

C04 is the **tie control** (symmetric, so no candidate beats the base) and C05 the **positive control** (the
look-ahead does real work). C05 gives the plant two receiving bays so the shovels and roads, not the crusher,
are the binding resource, which is what lets an asymmetry-aware policy separate from greedy.

## Geometry & constraints (the physics axes, issue #22)

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C08** | 4 shovels (3 ore + 1 waste), deep pit, long 8% ramps | **TRUCK-bound**: rimpull on 8% grades dominates the cycle; per-truck productivity well under the shallow twin | oracle bindingSide = trucks; per-truck tonnes << C09 |
| **C09** | 4 shovels, shallow pit, short flat roads | **SHOVEL-bound**: travel negligible, shovels saturate, dispatch matters little | oracle bindingSide = shovels |
| **C10** | 4 shovels (3 ore + 1 waste), crusher cap 2.6 kt/h | the **PLANT is the ceiling**: committed-in-flight gating keeps the crusher FEED at/under cap x shift (never overshoot); waste keeps moving to its own dump; the uncapped twin feeds far more | crusher feed <= 1.10 x cap-band; uncapped twin feeds > 1.1 x capped |
| **C11** | 4 shovels, mixed 793F + 930E fleet | heterogeneous speeds/payloads share the pit: both classes complete cycles (218 t and 290 t dumps both land) | crusher-feed deltas contain BOTH payloads |

C08/C09 are a matched pair: the *same* logic under opposite geometry, so the binding side flips from trucks
to shovels. C10 gates the **crusher feed** (not total tonnes: waste to its own dump is uncapped). C11 is the
heterogeneous-fleet case that produces bunching.

## Buffers, bays, and the boss

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C13** | 4 shovels, **2-bay crusher** + waste dump + **stockpile** | ore trucks **rehandle** onto the pile when both bays are busy + a queue forms; the reclaimer draws it down to feed the crusher (a SINK that becomes a SOURCE) | stockpile fills/draws; two trucks tip in parallel |
| **C14** | **BOSS**: 6 shovels, 2 phases, 3 dumps, mixed fleet | everything at once: a 2-bay crusher + waste dump + stockpile, ore/waste routing, rehandle + reclaim, and a mixed 793F + 930E fleet; a recognizably real open-pit network | full multi-source/multi-destination network |

C13 isolates the **buffer**: the stockpile level visibly rises on rehandle and falls on reclaim, and the
2-bay crusher halves the plant queue. C14 is the **boss** that combines every primitive into one network an
engineer would nod at, and is the case the offline replay/benchmark tiers stress.

## Stochastic regimes (rollout look-ahead)

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C15** | 4 shovels, high-variance load (Erlang k=2) + travel (lognormal CV 0.35) | bunching the mean-cost myopic assignment cannot see; the Monte-Carlo rollout samples it | stochastic rollout vs myopic (bunching) |
| **C16** | 4 shovels, near shovel fails on a Poisson clock (MTBF 1.5 h, MTTR 0.5 h) | a myopic policy keeps feeding a dying shovel; a look-ahead sampling failures hedges onto the healthy ones | stochastic rollout vs myopic (breakdown hedging) |

## Determinism and parity

The engine is a deterministic DES: an integer-tick clock, seeded named RNG streams, and a strict
`(time, priority, seq)` event order. Crusher bays, multi-destination routing, and the stockpile
rehandle/reclaim subsystem are implemented identically in the live engine (`sim/model.ts`) and the forkable
look-ahead engine (`sim/rolloutSim.ts`), and asserted **byte-for-byte equal** on the deterministic corpus
(including the boss C14 and the stockpile case C13) by the parity test in `frontend/test/cases23.test.ts`.

## References and provenance

- Match-factor definition and the MF = 1 balance point: standard truck-shovel productivity theory (Morgan &
  Peterson; Burt & Caccetta 2007 for the heterogeneous correction, DOI 10.1080/17480930701388606).
- Bunching from payload variance: Soofastaei et al. 2016, IJMST 26(5):745-752.
- Per-case numbers are baked to `data/derived/manifests/<case>.json` and asserted in
  `frontend/test/cases23.test.ts`; the axis-coverage gate is `frontend/test/axisCoverage.test.ts`.
