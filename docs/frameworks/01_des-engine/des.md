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
* **Match factor** (`matchfactor.ts`), the closed-form fleet-balance theory (the over-trucking knee at MF=1).
* **Policy hook** (`des.ts onDecision`), at each shovel-assignment decision the engine exposes the per-shovel state
  so a policy chooses, and (offline) logs the chosen action, the dataset the learned policies are trained on.

## Why it fits

A deterministic, seedable DES is the right substrate for a dispatch bench: it is reproducible (the replay contract),
fast enough to run live, and it generates its own honest training labels, no real fleet data, no fabricated numbers.

## Applying to other data

Any scenario that passes Contract 1 (a pit with N shovels, M trucks of a known model, a shift length) is simulable;
the policies + the comparison run over it. The engine has no plant-data dependency.
