# Engine, the discrete-event truck-shovel simulator

**What:** the live, deterministic discrete-event simulation (DES), the SOURCE OF TRUTH the learned policies imitate.
Pure TypeScript (`frontend/src/sim/`), so the SAME engine runs live in the browser AND logs the offline decision
dataset (via `node --import tsx`), which is why no Python re-port exists (a re-port would diverge).

## The model

* **Next-event time-advance**, an integer-tick (centisecond) clock; a binary-min-heap future-event list (`heap.ts`)
  keyed on a total-order `(time, priority, seq)` tuple so ties are deterministic.
* **Seedable streams**, a xoshiro128** PRNG over named streams (load/travel/dump), so a run is a pure function of the
  seed (ADR-0054 reproducibility); validated by a 1×1 closed-form **oracle test** (throughput = ⌊·⌋·payload exactly).
* **Truck kinematics** (`kinematics.ts`), haul times from rimpull/grade physics (total resistance = grade + rolling
  resistance; 793F anchored at 218 t / ~1976 kW / 60 km/h).
* **Haul-road traffic** (`traffic.ts` + `carFollow` in `model.ts`/`rolloutSim.ts`), travel time is NOT free-flow
  rimpull, it EMERGES from the road. Per directed road: a posted **speed limit** clamps the leg
  (`speedLimitedSec`); **FIFO car-following** holds a follower to `max(own arrival, leader arrival + h)` with the
  headway `h = SECURITY_M / avg leg speed`, so order is preserved (no overtaking) and bunching lengthens the cycle
  (Soofastaei et al. 2016); a **two-way meeting** adds a passing-bay delay `τ_m` when opposing traffic overlaps the
  leg. `model.ts` and the forkable `rolloutSim.ts` apply this identically, held by a **byte-for-byte parity test**,
  and the **capacity oracle** clamps by the same speed limit so it stays a valid upper bound. Full fidelity
  (direction zones, per-section capacity, per-segment rimpull/retarder) lives in the `minehaulsim` package, whose
  samples carry the REAL network as `topo.json` `roads/v1`.
* **Surface road network** (`topo.ts`), hauls route shovel -> bench -> ramp -> **portal** -> shared **trunk** ->
  junction -> curved **spur** -> destination (and the reverse for the empty return), drawn and travelled in both the
  2D map and the 3D view. No straight rim-to-dump magic lines.
* **Match factor** (`matchfactor.ts`), the closed-form fleet-balance theory (the over-trucking knee at MF=1).
* **Policy hook** (`des.ts onDecision`), at each shovel-assignment decision the engine exposes the per-shovel state
  so a policy chooses, and (offline) logs the chosen action, the dataset the learned policies are trained on.

## Why it fits

A deterministic, seedable DES is the right substrate for a dispatch bench: it is reproducible (the replay contract),
fast enough to run live, and it generates its own honest training labels, no real fleet data, no fabricated numbers.

## Applying to other data

Any scenario that passes Contract 1 (a pit with N shovels, M trucks of a known model, a shift length) is simulable;
the policies + the comparison run over it. The engine has no plant-data dependency.
