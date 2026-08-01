"""CONTRACT 1, ingestion (raw dispatch scenario -> pipeline). The *bring-your-own-mine* gate.

Declares the required schema (columns, units, ranges) of a truck-shovel dispatch scenario and an EXPLICIT outlier
policy: a scenario is ACCEPTED iff it passes; ill-formed scenarios are REJECTED with a reason (never silently
coerced); plausible-but-extreme scenarios are FLAGGED (accepted; the flag travels into the manifest, e.g. a wildly
over- or under-trucked fleet whose match factor is far from 1). This is what lets DispatchLab evaluate a NEW pit
instead of only replaying baked cases. Documented in data/README.md.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from .schema import TRUCK_MODELS, DispatchScenario

REQUIRED_COLUMNS: tuple[str, ...] = ("case_id", "n_shovels", "n_trucks", "truck_model", "shift_sec")

VALID_MODELS: frozenset[str] = frozenset(TRUCK_MODELS)
SHOVELS_RANGE = (1, 40)
TRUCKS_RANGE = (1, 400)
SHIFT_RANGE = (600, 86400)         # seconds (10 min .. 24 h)
MF_FLAG_LO, MF_FLAG_HI = 0.4, 2.5  # match factor far outside [0.4, 2.5] => FLAG (severely under/over-trucked)
CYCLE_RATIO = 4.0                  # nominal trucks-per-shovel at MF=1 (a coarse balance heuristic)


@dataclass
class ContractReport:
    accepted: list[DispatchScenario]
    rejected: list[dict[str, Any]]
    flagged: list[dict[str, Any]]

    @property
    def ok(self) -> bool:
        return len(self.accepted) > 0

    def summary(self) -> str:
        return f"{len(self.accepted)} accepted, {len(self.rejected)} rejected, {len(self.flagged)} flagged"


def validate_records(raw_rows: list[dict[str, Any]]) -> ContractReport:
    """Apply CONTRACT 1 to raw dispatch-scenario rows (e.g. from a CSV). Pure; deterministic; no I/O."""
    accepted: list[DispatchScenario] = []
    rejected: list[dict[str, Any]] = []
    flagged: list[dict[str, Any]] = []

    for i, row in enumerate(raw_rows):
        cid = str(row.get("case_id", f"row{i}"))
        missing = [c for c in REQUIRED_COLUMNS if c not in row or row[c] in (None, "")]
        if missing:
            rejected.append({"row": i, "case_id": cid, "reason": f"missing/empty columns: {missing}"})
            continue
        try:
            n_shovels = int(float(row["n_shovels"]))
            n_trucks = int(float(row["n_trucks"]))
            shift = int(float(row["shift_sec"]))
        except (TypeError, ValueError):
            rejected.append({"row": i, "case_id": cid, "reason": "non-numeric n_shovels/n_trucks/shift_sec"})
            continue
        model = str(row["truck_model"])

        bad: list[str] = []
        if not (SHOVELS_RANGE[0] <= n_shovels <= SHOVELS_RANGE[1]):
            bad.append(f"n_shovels={n_shovels} out of {SHOVELS_RANGE}")
        if not (TRUCKS_RANGE[0] <= n_trucks <= TRUCKS_RANGE[1]):
            bad.append(f"n_trucks={n_trucks} out of {TRUCKS_RANGE}")
        if not (SHIFT_RANGE[0] <= shift <= SHIFT_RANGE[1]):
            bad.append(f"shift_sec={shift} out of {SHIFT_RANGE}")
        # mixed fleets declare "A+B": every component must be a valid model (#23, C11)
        if any(part not in VALID_MODELS for part in model.split("+")):
            bad.append(f"truck_model={model!r} not in {sorted(VALID_MODELS)} (or 'A+B' of them)")
        if bad:
            rejected.append({"row": i, "case_id": cid, "reason": "; ".join(bad)})
            continue

        mf = n_trucks / (n_shovels * CYCLE_RATIO) if n_shovels > 0 else math.inf
        rec_flags: list[str] = []
        if not (MF_FLAG_LO <= mf <= MF_FLAG_HI):
            regime = "under-trucked" if mf < MF_FLAG_LO else "over-trucked"
            rec_flags.append(f"match factor ~{mf:.2f} ({regime}) outside [{MF_FLAG_LO},{MF_FLAG_HI}], dispatch barely matters / queues dominate")

        if rec_flags:
            flagged.append({"case_id": cid, "flags": rec_flags})
        accepted.append(DispatchScenario(case_id=cid, n_shovels=n_shovels, n_trucks=n_trucks, truck_model=model,
                                         shift_sec=shift, expected_mf=round(mf, 3), flags=tuple(rec_flags)))
    return ContractReport(accepted=accepted, rejected=rejected, flagged=flagged)
