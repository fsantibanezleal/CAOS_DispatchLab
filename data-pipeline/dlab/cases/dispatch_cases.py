"""DispatchLab cases spanning CATEGORIES (the truck-shovel dispatch problem-type taxonomy). The App shows ONE
selected case; Experiments/Benchmark show cross-case summaries by category. The 8 cases mirror the SPA's
src/sim/cases.ts (C01-C07 + the C12 oracle). All results are deterministic DES-SIMULATION outputs, NOT a real plant —
stated openly. C12 is the closed-form ORACLE control (throughput must equal the exact analytic value)."""
from __future__ import annotations

from dataclasses import dataclass

SHIFT_SEC = 28800   # 8-hour shift (matches src/sim/cases.ts SHIFT)

SINGLE = "single-shovel match-factor (the MF sweep)"
MULTI = "multi-shovel dispatch (the policy decision)"
ORACLE = "oracle control (closed-form check)"


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
         "shovel-bound: throughput SATURATES, large truck wait — dispatch can't fix over-trucking",
         "over-trucking knee (Kneedle @ MF=1)"),
    Case("C03", "Under-trucked (MF≈0.5)", SINGLE, 1, 2, "793F",
         "shovel idle: throughput scales ~linearly, low truck wait — add trucks, not dispatch",
         "under-trucked regime (MF<1)"),
    Case("C04", "Two shovels, symmetric roads (MF≈1)", MULTI, 2, 8, "793F",
         "symmetric: all five policies tie at ~equal tonnes (dispatch barely matters when balanced)",
         "symmetric two-shovel control"),
    Case("C05", "Asymmetric roads (near + far shovel)", MULTI, 2, 8, "793F",
         "a genuine Pareto trade-off: greedy maxes tonnes, min-truck-wait minimises wait, fixed is dominated",
         "asymmetric Pareto front + TIE rule"),
    Case("C06", "Three shovels, mixed distances", MULTI, 3, 12, "793F",
         "a real multi-way learned decision — the learned policies are competitive (within ~1% of the best heuristic)",
         "3-shovel learned-vs-heuristic"),
    Case("C07", "Four shovels, asymmetric", MULTI, 4, 18, "793F",
         "the hardest dispatch: 4-way assignment, the learned policy a single fast recovered dispatcher",
         "4-shovel learned-vs-heuristic"),
    Case("C12", "1-truck-1-shovel oracle", ORACLE, 1, 1, "793F",
         "throughput = floor(shift / cycle) · payload EXACTLY — the closed-form determinism check",
         "closed-form 1x1 oracle (exact)"),
]
