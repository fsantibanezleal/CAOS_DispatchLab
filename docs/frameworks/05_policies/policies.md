# Method — classical dispatch policies + match factor

**Provenance:** the classical truck-shovel criteria (minimise-truck-wait / minimise-shovel-wait — the two conflicting
operational objectives); match-factor theory (Morgan & Peterson; Burt & Caccetta for heterogeneous fleets).

**What:** the five classical baselines the learned policies are measured against, and the closed-form fleet-balance
theory the simulator reproduces.

## The five policies (`frontend/src/policies/heuristics.ts`)

* **greedy** — assign to the shovel with the earliest completion of the truck's load.
* **shortestWait** — minimise the truck's expected wait (backlog × load time).
* **minTruckWait** — the classic "max trucks" criterion: minimise truck wait at arrival.
* **minShovelWait** — the classic "max shovels" criterion: minimise shovel idle.
* **fixed** — static truck→shovel assignment (the baseline that ignores state).

`minTruckWait` and `minShovelWait` genuinely conflict on an asymmetric pit (they trade tonnes for balance) — which is
why the honest summary is a Pareto frontier + a TIE rule, not a single winner.

## Match factor

`MF = trucks / (shovels × cycle ratio)` (a coarse balance). Throughput scales ~linearly while MF<1 (shovel idle) then
SATURATES as MF crosses 1 (over-trucked, queues form). The fleet-size sweep validates this: the over-trucking knee
(Kneedle) lands at MF=1. Contract 1 flags scenarios far from MF=1 (dispatch barely matters there).
