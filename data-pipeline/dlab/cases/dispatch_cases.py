"""DispatchLab cases spanning CATEGORIES (the truck-shovel dispatch problem-type taxonomy). The App shows ONE
selected case; Experiments/Benchmark show cross-case summaries by category. The 16 cases mirror the SPA's
src/sim/cases.ts. The corpus is MULTI-SOURCE and MULTI-DESTINATION: >= 4 shovels is the floor (the only sub-4
cases are the labelled controls C01-C03 + the 1x1 oracle C12), ore routes to a crusher / waste to a waste
dump, C07 runs two crushers, C13/C14 add crusher receiving bays + a stockpile (rehandle + reclaim), and C11/C14
run a heterogeneous 793F + 930E fleet. All results are DES-SIMULATION outputs, NOT a real plant, stated openly.
C12 is the closed-form ORACLE control; C15/C16 are the stochastic regimes (high-variance cycles / Poisson
breakdowns) where myopic assignment is genuinely suboptimal and the Monte-Carlo rollout dispatcher is evaluated."""
from __future__ import annotations

from dataclasses import dataclass

SHIFT_SEC = 28800   # 8-hour shift (matches src/sim/cases.ts SHIFT)

SINGLE = "single-shovel match-factor (the MF sweep)"
MULTI = "multi-shovel dispatch (the policy decision)"
GEOM = "geometry & constraints (the #22 physics axes)"
NETWORK = "multi-source / multi-destination network (bays, stockpiles, the boss)"
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
    Case("C01", "Control: balanced single-shovel (MF~1)", SINGLE, 1, 4, "793F",
         "match factor ~1: all policies TIE (dispatch barely matters on a balanced pit)",
         "match-factor theory (MF=1 optimum)"),
    Case("C02", "Control: over-trucked single-shovel (MF~2)", SINGLE, 1, 8, "793F",
         "shovel-bound: throughput SATURATES, large truck wait, dispatch can't fix over-trucking",
         "over-trucking knee (Kneedle @ MF=1)"),
    Case("C03", "Control: under-trucked single-shovel (MF~0.5)", SINGLE, 1, 2, "793F",
         "shovel idle: throughput scales ~linearly, low truck wait, add trucks, not dispatch",
         "under-trucked regime (MF<1)"),
    Case("C04", "Four shovels, symmetric roads (tie control)", MULTI, 4, 16, "793F",
         "symmetric: all policies tie at ~equal tonnes; the rollout must equal its base EXACTLY (tie control)",
         "symmetric four-shovel tie control"),
    Case("C05", "Four shovels, asymmetric roads (positive control)", MULTI, 4, 12, "793F",
         "strong asymmetry with a 2-bay plant so the shovels/roads bind: greedy over-loads the near shovel, "
         "the look-ahead STRICTLY beats the base (real dispatch gain)",
         "asymmetric four-shovel positive control (rollout > base)"),
    Case("C06", "Ore + waste routing (crusher + waste dump)", MULTI, 4, 16, "793F",
         "two destinations: ore routes to the crusher, waste to the waste dump; the decision gains 'which dump'",
         "multi-destination routing (ore vs waste)"),
    Case("C07", "Two crushers (nearest-plant routing)", MULTI, 4, 18, "793F",
         "two ore plants: each shovel's ore routes to the nearest crusher; each plant carries its own feed KPI",
         "multiple-crusher routing + per-plant feed"),
    Case("C08", "Deep pit (long 8% ramps, truck-bound)", GEOM, 4, 16, "793F",
         "TRUCK-bound (capacity oracle binds on the fleet): rimpull on 8% grades dominates the cycle; "
         "per-truck productivity well under the shallow twin",
         "oracle bindingSide = trucks; per-truck tonnes << C09"),
    Case("C09", "Shallow pit (short flat roads, shovel-bound)", GEOM, 4, 20, "793F",
         "SHOVEL-bound (oracle binds on service): travel negligible, shovels saturate, dispatch matters little",
         "oracle bindingSide = shovels"),
    Case("C10", "Crusher-limited (2.6 kt/h plant cap)", GEOM, 4, 18, "793F",
         "the PLANT is the ceiling: committed-in-flight gating keeps the crusher FEED at/under cap x shift "
         "(never overshoot); waste keeps moving to its own dump; the uncapped twin proves the fleet could feed more",
         "crusher feed <= 1.10 x cap-band; uncapped twin feeds > 1.1 x capped"),
    Case("C11", "Mixed fleet (793F + 930E)", GEOM, 4, 12, "793F+930E",
         "heterogeneous speeds/payloads share the pit: both classes complete cycles (218 t and 290 t dumps "
         "both land); the bunching source the traffic literature describes",
         "crusher-feed deltas contain BOTH payloads"),
    Case("C12", "Control: 1-truck-1-shovel oracle", ORACLE, 1, 1, "793F",
         "throughput = floor(shift / cycle) . payload EXACTLY, the closed-form determinism check",
         "closed-form 1x1 oracle (exact)"),
    Case("C13", "Crusher bays + stockpile rehandle", NETWORK, 4, 20, "793F",
         "a 2-bay crusher plus a stockpile: ore trucks REHANDLE onto the pile when both bays are busy and a "
         "queue forms; a reclaimer draws the pile down to feed the crusher (a SINK that becomes a SOURCE)",
         "stockpile fills/draws; crusher bays serve two trucks"),
    Case("C14", "Boss: 6 shovels, 2 phases, 3 dumps, mixed fleet", NETWORK, 6, 14, "793F+930E",
         "everything at once: 6 shovels across 2 phases, 3 dumps (2-bay crusher + waste dump + stockpile), "
         "ore/waste routing, rehandle + reclaim, and a mixed 793F + 930E fleet; a recognizably real open-pit network",
         "full multi-source/multi-destination network (all primitives)"),
    Case("C15", "Stochastic cycle times (Erlang load + travel noise)", STOCH, 4, 16, "793F",
         "high-variance load (Erlang k=2) + travel (lognormal CV 0.35) drive bunching the mean-cost "
         "myopic assignment cannot see; the Monte-Carlo rollout samples it (>= base by the improvement bound)",
         "stochastic rollout vs myopic (variance-driven bunching)"),
    Case("C16", "Shovel breakdowns (Poisson failure + repair)", STOCH, 4, 16, "793F",
         "the near shovel fails on a Poisson clock (MTBF 1.5 h, MTTR 0.5 h); a myopic policy keeps feeding a "
         "dying shovel, a look-ahead sampling failures hedges onto the healthy ones",
         "stochastic rollout vs myopic (breakdown hedging)"),
]
