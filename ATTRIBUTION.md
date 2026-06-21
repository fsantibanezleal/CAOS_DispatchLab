# Attribution — methods & data

## Methods (DOI-verified — see `frontend/src/data/citations.ts`)

| Method | Reference |
|---|---|
| Discrete-event simulation (next-event time-advance) | the standard DES paradigm (Banks et al.) |
| Match factor (fleet balance) | Morgan & Peterson; Burt & Caccetta (heterogeneous-fleet MF) |
| Truck-shovel dispatch criteria | the classical min-truck-wait / min-shovel-wait operational criteria |
| Truck haulage kinematics | rimpull/grade resistance (Caterpillar 793F performance handbook anchors) |
| Imitation / behaviour cloning | the standard imitation-learning formulation (from logged expert decisions) |

## Data / honesty

DispatchLab uses **no real fleet-management data**. The discrete-event simulation is deterministic + seeded, anchored
to published truck performance figures (793F = 218 t / ~1976 kW / 60 km/h); the mine layouts + the 8 cases are
illustrative. The two learned policies are trained on the simulation's OWN logged decisions, so they honestly emulate
the classical heuristics — they are **competitive (within ~1% of the best heuristic)**, NOT a fabricated RL win, and
the Benchmark page states this. No real plant data is re-hosted; no fabricated benchmark numbers.
