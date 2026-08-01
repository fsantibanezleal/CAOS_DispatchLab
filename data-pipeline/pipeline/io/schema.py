"""Typed objects passed between pipeline stages, the inter-stage contract. Plain dataclasses (no heavy deps)."""
from __future__ import annotations

from dataclasses import dataclass, field

TRUCK_MODELS = ("793F", "789D", "777G", "930E")  # the rimpull-anchored haul-truck classes
# mixed fleets are declared as "A+B" (each component must be a valid model), C11 (#23)
POLICIES = ("greedy", "shortestWait", "minTruckWait", "minShovelWait", "fixed")  # the classical tiers
LEARNED = ("dl-policy", "dl-bcbest")             # the two learned ONNX policies


@dataclass(frozen=True)
class DispatchScenario:
    """One validated truck-shovel dispatch scenario (CONTRACT 1 output), the mine layout + the fleet."""
    case_id: str
    n_shovels: int
    n_trucks: int
    truck_model: str                # one of TRUCK_MODELS
    shift_sec: int
    expected_mf: float = 0.0        # match factor ~ n_trucks / (n_shovels * cycle ratio); regime indicator
    flags: tuple[str, ...] = ()


@dataclass(frozen=True)
class DispatchResult:
    """A multi-policy comparison summary for one scenario (the trace payload)."""
    case_id: str
    policy_stats: list           # per policy: {id, medTonnes, medWaitH, loT, hiT}
    best_policy: str
    extra: dict = field(default_factory=dict)
