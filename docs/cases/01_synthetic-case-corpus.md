# 01 · The synthetic case corpus

The Synthetic lane runs a fixed corpus of **12 deterministic DES cases**, defined once in
`data-pipeline/dlab/cases/dispatch_cases.py` and mirrored byte-for-byte by the SPA in
`frontend/src/sim/cases.ts`. Each case is a truck-shovel configuration chosen to isolate ONE axis of the
dispatch problem, so that a policy's behaviour can be read against a known-correct expectation instead of a
vibe. Every "expected band" below is an **asserted** test, not a claim: it is checked in
`frontend/test/cases23.test.ts`, and the closed-form controls (C01/C04 tie, C05 Pareto, C12 oracle) are the
anchors that keep the whole corpus honest.

All results are outputs of a deterministic discrete-event simulation. **No real plant data is used or
claimed in this lane** (the Real-sample lane is separate, see [02](02_real-sample-lane.md)).

## The four categories

### A. Single-shovel match-factor (the MF sweep)

The match factor is the ratio of hauling capacity to loading capacity:

$$\mathrm{MF} = \frac{N_t \, t_L}{N_s \, T_c}$$

with `N_t` trucks, `N_s` shovels, `t_L` the load time and `T_c` the truck cycle time. `MF = 1` is the
theoretical balance point; below it the shovel starves, above it trucks queue and throughput saturates.

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C01** | 1 shovel, 4 trucks (MF ≈ 1) | all policies **TIE** at ~equal tonnes; dispatch barely matters on a balanced pit | match-factor optimum (MF = 1) |
| **C02** | 1 shovel, 8 trucks (MF ≈ 2) | **shovel-bound**: throughput saturates, large truck wait; dispatch cannot fix over-trucking | over-trucking knee (Kneedle @ MF = 1) |
| **C03** | 1 shovel, 2 trucks (MF ≈ 0.5) | **shovel idle**: throughput scales ~linearly, low truck wait; add trucks, not dispatch | under-trucked regime (MF < 1) |

C01 is a **control**: a method that claims a large win on a balanced pit is suspect, and the baked
case-results carry the TIE verdict. C02/C03 bracket the knee that the fleet-size sweep in Experiments
reproduces (the over-trucking knee at MF = 1), which is how match-factor theory is *validated* here rather
than assumed.

### B. Multi-shovel dispatch (the policy decision)

Where dispatch actually earns its keep: more than one shovel to assign the next truck to.

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C04** | 2 shovels, 8 trucks, symmetric roads (MF ≈ 1) | all five heuristics **TIE** at ~equal tonnes (dispatch barely matters when balanced) | symmetric two-shovel control |
| **C05** | 2 shovels, 8 trucks, asymmetric (near + far) | a genuine **Pareto trade-off**: greedy maxes tonnes, min-truck-wait minimises wait, fixed is dominated | asymmetric Pareto front + TIE rule |
| **C06** | 3 shovels, 12 trucks, mixed distances | a real multi-way learned decision; the learned policies are **competitive** (within ~1% of the best heuristic) | 3-shovel learned-vs-heuristic |
| **C07** | 4 shovels, 18 trucks, asymmetric | the hardest dispatch: 4-way assignment; the learned policy is a single fast recovered dispatcher | 4-shovel learned-vs-heuristic |

C05 is the **Pareto control**: it is the case that proves dispatch is multi-objective. The App reports it as
a Pareto front plus a TIE rule, never as a single "winner", because on this pit greedy and min-truck-wait
optimise different objectives and neither dominates.

### C. Geometry & constraints (the physics axes, issue #22)

These cases turn the road network and the plant into the binding resource, so the App can show *which*
resource limits throughput and *why*.

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C08** | 2 shovels, 14 trucks, deep pit, long 8% ramps | **TRUCK-bound**: rimpull on 8% grades dominates the cycle; per-truck productivity well under the shallow twin | oracle bindingSide = trucks; per-truck tonnes << C09 |
| **C09** | 2 shovels, 8 trucks, shallow pit, short flat roads | **SHOVEL-bound**: travel negligible, shovels saturate, dispatch matters little | oracle bindingSide = shovels |
| **C10** | 3 shovels, 14 trucks, crusher cap 2.6 kt/h | the **PLANT is the ceiling**: committed-in-flight gating keeps delivered tonnes at/under cap x shift (never overshoot); the uncapped twin proves the fleet could do more | tonnes <= 1.10 x cap-band; uncapped twin > 1.1 x capped |
| **C11** | 3 shovels, 12 trucks, mixed 793F + 930E fleet | heterogeneous speeds/payloads share the pit: both classes complete cycles (218 t and 290 t dumps both land); the bunching the traffic literature describes | crusher-feed deltas contain BOTH payloads |

C08/C09 are a matched pair: the *same* two-shovel logic under opposite geometry, so the binding side flips
from trucks to shovels. C10 exercises the plant constraint added in #22 (committed-in-flight gating that can
never overshoot the crusher cap). C11 is the heterogeneous-fleet case that produces bunching.

### D. Oracle control (closed-form check)

| id | config | expected band (asserted) | anchor |
|---|---|---|---|
| **C12** | 1 truck, 1 shovel | throughput = `floor(shift / cycle) · payload` **EXACTLY** | closed-form 1x1 oracle (exact) |

C12 is the determinism anchor for the entire simulator. With a single truck and a single shovel there is no
queueing and no dispatch decision, so the DES timeline must reproduce the closed-form throughput to the
tonne. If C12 drifts, the timeline is wrong and every other case is suspect.

## Why a control-heavy corpus

Three of the twelve cases (C01/C04 tie, C05 Pareto, C12 oracle) produce no exciting "policy A beats policy B"
headline; they exist precisely to catch a lie. A dispatch method that wins on a balanced pit (C01/C04), or
that reports a single winner where the objectives genuinely trade off (C05), or that breaks the exact 1x1
throughput (C12), is wrong regardless of how good it looks on C06/C07. The corpus is designed so the
interesting cases are only trusted because the boring controls hold.

## References and provenance

- Match-factor definition and the MF = 1 balance point: standard truck-shovel productivity theory (Morgan &
  Peterson; used throughout open-pit haulage planning).
- Per-case numbers are baked to `data/derived/manifests/<case>.json` and asserted in
  `frontend/test/cases23.test.ts`; the held-out / Pareto / MF-sweep evaluation protocol is documented in
  [`../architecture/06_model-evaluation.md`](../architecture/06_model-evaluation.md).
