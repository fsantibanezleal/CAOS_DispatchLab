# 01 · The synthetic case corpus

The Synthetic lane runs a fixed corpus of **8 deterministic DES cases**, defined once in
`data-pipeline/dlab/cases/dispatch_cases.py` and mirrored by the SPA in `frontend/src/sim/cases.ts`. A real
truck-shovel problem is **multi-source and multi-destination with an intermediate ore buffer**, so the corpus
is built to that shape, round 2 of issue #67 rebuilt it to be domain-correct rather than a set of thin toys.

## The material-flow model (domain-correct)

A **stockpile is mined ORE held TEMPORARILY** to be sent to the plant later. It is **not** a dump. The only
legal movements are:

**Loaded (a truck carrying material), exactly three:**

1. `shovel(ore)  -> crusher/plant`   direct ore to the plant
2. `shovel(ore)  -> stockpile`       buffer ore temporarily (**rehandle**)
3. `shovel(waste)-> waste dump`      waste, terminal

**Empty (the only empty movement):** `delivery-point -> a SHOVEL of the same material lane`. From a crusher or
stockpile the empty truck returns to an **ore** face; from a waste dump it returns to a **waste** face.

**Reclaim (non-truck):** `stockpile -> plant` is the **reclaimer / conveyor**, continuous and active; it
draws the pile down to feed the plant. There is **no** truck leg `stockpile -> plant`.

**Invalid paths never authored:** `stockpile -> dump`, `dump -> anywhere`, `plant -> anywhere`,
`dump/plant -> stockpile`, any truck `stockpile -> plant`. A topology test in
`frontend/test/axisCoverage.test.ts` asserts the route table **and every baked leg** is one of the valid path
types; any invalid path fails the build. **No unused topology:** every authored road carries real traffic in
the baked trace.

## The pit portal + internal road network

Every pit has a single **EXIT / PORTAL**. A haul is a **polyline**, never a straight shovel-to-destination
line:

- **Loaded:** `shovel -> internal pit roads (the ramp climb) -> PORTAL -> a direct surface haul -> destination`.
- **Empty:**  `destination -> direct surface haul -> PORTAL -> internal pit roads -> shovel`.

The DES leg time is the **sum of the two rimpull segments** (`sim/haul.ts`): the internal `pitRoad[shovel]`
(carries the ramp grade) plus the surface `portalHaul[dump]` (flatter). This is why an empty truck visibly
travels back on drawn roads through the portal and **never** interpolates to the origin, `posOf()` in
`sim/model.ts` throws on any unresolved node id, so a vanishing truck can never ship. The portal placement and
the internal road layout are **authored per pit** (a deep pit has long steep internal ramps to a deep portal;
a plane pit has short flat internal roads), so this network **is** the distinct topography and no two cases
look alike.

## Simple teaching tier (C01-C03: >= 4 shovels, >= 2 destinations)

Kept deliberately simple: multi-source and multi-destination, but no stockpile. They teach routing, the match
factor, and the two-plant decision.

The match factor is the ratio of hauling capacity to loading capacity:

$$\mathrm{MF} = \frac{N_t \, t_L}{N_s \, T_c}$$

with `N_t` trucks, `N_s` shovels, `t_L` the load time and `T_c` the truck cycle time. `MF = 1` is the balance
point; below it the shovel starves, above it trucks queue and throughput saturates.

| id | config | what it teaches |
|---|---|---|
| **C01** | 4 shovels (2 ore + 2 waste), 1-bay crusher + waste dump, **shallow compact pit** | the "which dump" decision by face type + reading the match factor; short flat hauls so the shovels bind |
| **C02** | 4 ore shovels, **two 1-bay plants**, round pit | two plants, each with its own feed KPI; the ore lane balances them across cycles |
| **C03** | 4 shovels (3 ore near/mid/far + 1 waste), 1-bay crusher + waste dump, **tilted pit** | strong haul asymmetry, greedy over-loads the near shovel, a look-ahead does real work |

## Complex / dynamic tier (C04-C07: >= 6 shovels, an actively-cycled ore stockpile)

Each has an intermediate ore **stockpile** that genuinely cycles: the crusher is the binding bottleneck, so
ore trucks constantly **rehandle** onto the pile (path 2) and the **reclaimer** draws it back down (reclaim).
The axis gate asserts, on the deterministic baked trace, that each pile **fills to >= 30 % of capacity AND
draws back down** (max drawdown >= 10 %), with both rehandle legs and active reclaim present. A dead / never
filled stockpile fails the build.

| id | config | geometry + dynamics |
|---|---|---|
| **C04** | 6 shovels, 2-bay crusher + waste dump + stockpile | **DEEP narrow pit**: long 8-9 % internal ramps, per-truck productivity far below a shallow pit; high load/travel variance (the bunching a rollout can hedge) |
| **C05** | 8 shovels, 2-bay crusher + waste dump + stockpile | **SHALLOW wide pit**: short flat roads, the shovels bind; the slow crusher cannot take all the ore, so the pile fills through the shift and the reclaimer + a mid-shift break draw it down |
| **C06** | 8 shovels, 2-bay Plant A (buffered) + 1-bay Plant B + waste dump + stockpile | **two plants**, a near ore shovel that **fails on a Poisson clock**, and a mixed 793F + 930E fleet |
| **C07** | 8 shovels, slow 2-bay crusher + waste dump + stockpile | a **throughput-limited plant** forces heavy rehandle, under a blend window and a mid-shift break |

## The boss / showcase (C08)

| id | config | what it combines |
|---|---|---|
| **C08** | **12 shovels across 3 phases**, 2 plants (2-bay + 1-bay), 2 waste dumps, a stockpile, mixed 793F + 930E fleet | everything at once: ore/waste routing, rehandle + active reclaim, a Poisson breakdown, high cycle variance, a blend window and a mid-shift break, a recognizably real open-pit network. It is the default case and the one the offline benchmark tiers stress. |

## Correctness anchors (test fixtures, not user tiles)

The round-2 corpus has **no 1-source tiles**. The determinism anchors live as fixtures in
`frontend/test/fixtures.ts` so they survive without a 1-source user case:

- **1x1 oracle** a single truck / shovel / crusher pit whose deterministic throughput equals
  `floor((shift - t1)/cycle + 1) * payload` **exactly** (the simulator's determinism anchor).
- **symmetric tie control** a perfectly symmetric multi-shovel pit where every policy (and the rollout vs its
  base) **ties** exactly, a "win" here would be a leak and fails the build.
- **asymmetric positive control** a strongly asymmetric pit where the look-ahead rollout **strictly beats**
  its myopic base (real dispatch gain).

## CI-enforced gates (a toy / dead / off-road corpus FAILS the build)

`frontend/test/axisCoverage.test.ts` asserts:

- exactly **2-3 simple cases** (>= 4 src, >= 2 dest); every **other** case >= 6 src, >= 2 dest, >= 1 stockpile;
- source counts **scale** (6, 8, >= 12), the showcase C08 is large;
- each stockpile **fills to >= 30 % AND draws down**, with rehandle legs + active reclaim;
- the route table + every baked leg is a **valid material-flow path only**;
- **empty trucks return to a same-lane shovel on a road**; none render at the origin;
- every primitive appears (>= 4 shovels, multi-dump, waste dump, multiple crushers, stockpile + reclaim,
  crusher bays 1 & 2, mixed fleet).

## Determinism and parity

The engine is a deterministic DES: an integer-tick clock, seeded named RNG streams, and a strict
`(time, priority, seq)` event order. Crusher bays, multi-destination routing, the portal-aware haul timing,
the material-lane empty-return and the stockpile rehandle/reclaim subsystem are implemented identically in the
live engine (`sim/model.ts`) and the forkable look-ahead engine (`sim/rolloutSim.ts`), and asserted
**byte-for-byte equal** on the deterministic corpus by the parity test in `frontend/test/cases23.test.ts`.

All results are outputs of a deterministic discrete-event simulation. **No real plant data is used or claimed
in this lane** (the Real-sample lane is separate, see [02](02_real-sample-lane.md)).

## References and provenance

- Match-factor definition and the MF = 1 balance point: standard truck-shovel productivity theory (Morgan &
  Peterson; Burt & Caccetta 2007 for the heterogeneous correction, DOI 10.1080/17480930701388606).
- Bunching from payload variance: Soofastaei et al. 2016, IJMST 26(5):745-752.
- Rollout as one policy-improvement step: Bertsekas, Tsitsiklis & Wu 1997 (DOI 10.1023/A:1009635226865);
  the stochastic-scheduling variant: Bertsekas & Castanon 1999 (DOI 10.1023/A:1009634810396).
- Per-case numbers are baked to `data/derived/manifests/<case>.json`; the gates are
  `frontend/test/axisCoverage.test.ts` + `frontend/test/cases23.test.ts`.
