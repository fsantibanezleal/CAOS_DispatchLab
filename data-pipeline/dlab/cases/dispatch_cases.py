"""DispatchLab cases spanning CATEGORIES (the truck-shovel dispatch problem-type taxonomy). The App shows ONE
selected case; Experiments/Benchmark show cross-case summaries by category. The 14 cases mirror the SPA's
src/sim/cases.ts (C01-C12 + the stochastic pair C15/C16). All results are DES-SIMULATION outputs, NOT a real
plant, stated openly. C12 is the closed-form ORACLE control (throughput must equal the exact analytic value);
C15/C16 are the stochastic regimes (high-variance cycles / Poisson breakdowns) where myopic assignment is
genuinely suboptimal and the Monte-Carlo rollout dispatcher is evaluated."""
from __future__ import annotations

from dataclasses import dataclass

SHIFT_SEC = 28800   # 8-hour shift (matches src/sim/cases.ts SHIFT)

SINGLE = "single-shovel match-factor (the MF sweep)"
MULTI = "multi-shovel dispatch (the policy decision)"
GEOM = "geometry & constraints (the #22 physics axes)"
ORACLE = "oracle control (closed-form check)"
STOCH = "stochastic regime (rollout look-ahead)"


@dataclass(frozen=True)
class Case:
    id: str                       # matches src/sim/cases.ts CASES
    name: str
    category: str
    n_shovels: int
    n_trucks: int
    truck_model: str
    expected_band: str
    validation_anchor: str
    shift_sec: int = SHIFT_SEC
    real_or_synthetic: str = "simulation"   # deterministic DES, not a real plant


CASES: list[Case] = [
    Case("C01", "Balanced single-shovel (MF≈1)", SINGLE, 1, 4, "793F",
         "match factor ~1: all policies TIE (dispatch barely matters on a balanced pit)",
         "match-factor theory (MF=1 optimum)"),
    Case("C02", "Over-trucked (MF≈2)", SINGLE, 1, 8, "793F",
         "shovel-bound: throughput SATURATES, large truck wait, dispatch can't fix over-trucking",
         "over-trucking knee (Kneedle @ MF=1)"),
    Case("C03", "Under-trucked (MF≈0.5)", SINGLE, 1, 2, "793F",
         "shovel idle: throughput scales ~linearly, low truck wait, add trucks, not dispatch",
         "under-trucked regime (MF<1)"),
    Case("C04", "Two shovels, symmetric roads (MF≈1)", MULTI, 2, 8, "793F",
         "symmetric: all five policies tie at ~equal tonnes (dispatch barely matters when balanced)",
         "symmetric two-shovel control"),
    Case("C05", "Asymmetric roads (near + far shovel)", MULTI, 2, 8, "793F",
         "a genuine Pareto trade-off: greedy maxes tonnes, min-truck-wait minimises wait, fixed is dominated",
         "asymmetric Pareto front + TIE rule"),
    Case("C06", "Three shovels, mixed distances", MULTI, 3, 12, "793F",
         "a real multi-way learned decision, the learned policies are competitive (within ~1% of the best heuristic)",
         "3-shovel learned-vs-heuristic"),
    Case("C07", "Four shovels, asymmetric", MULTI, 4, 18, "793F",
         "the hardest dispatch: 4-way assignment, the learned policy a single fast recovered dispatcher",
         "4-shovel learned-vs-heuristic"),
    Case("C08", "Deep pit (long 8% ramps)", GEOM, 2, 14, "793F",
         "TRUCK-bound (capacity oracle binds on the fleet): rimpull on 8% grades dominates the cycle; "
         "per-truck productivity well under the shallow twin",
         "oracle bindingSide = trucks; per-truck tonnes << C09"),
    Case("C09", "Shallow pit (short flat roads)", GEOM, 2, 8, "793F",
         "SHOVEL-bound (oracle binds on service): travel negligible, shovels saturate, dispatch matters little",
         "oracle bindingSide = shovels"),
    Case("C10", "Crusher-limited (2.6 kt/h cap)", GEOM, 3, 14, "793F",
         "the PLANT is the ceiling: committed-in-flight gating keeps delivered tonnes at/under cap x shift "
         "(never overshoot); the uncapped twin proves the fleet could do more",
         "tonnes <= 1.10 x cap-band; uncapped twin > 1.1 x capped"),
    Case("C11", "Mixed fleet (793F + 930E)", GEOM, 3, 12, "793F+930E",
         "heterogeneous speeds/payloads share the pit: both classes complete cycles (218 t and 290 t dumps "
         "both land); the bunching source the traffic literature describes",
         "crusher-feed deltas contain BOTH payloads"),
    Case("C12", "1-truck-1-shovel oracle", ORACLE, 1, 1, "793F",
         "throughput = floor(shift / cycle) · payload EXACTLY, the closed-form determinism check",
         "closed-form 1x1 oracle (exact)"),
    Case("C15", "Stochastic cycle times (Erlang load + travel noise)", STOCH, 3, 12, "793F",
         "high-variance load (Erlang k=2) + travel (lognormal CV 0.35) drive bunching the mean-cost "
         "myopic assignment cannot see; the Monte-Carlo rollout samples it (>= base by the improvement bound)",
         "stochastic rollout vs myopic (variance-driven bunching)"),
    Case("C16", "Shovel breakdowns (Poisson failure + repair)", STOCH, 3, 12, "793F",
         "the near shovel fails on a Poisson clock (MTBF 1.5 h, MTTR 0.5 h); a myopic policy keeps feeding a "
         "dying shovel, a look-ahead sampling failures hedges onto the healthy ones",
         "stochastic rollout vs myopic (breakdown hedging)"),
]
