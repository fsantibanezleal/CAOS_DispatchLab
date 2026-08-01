"""The compact per-case TRACE = the web-replay artifact. Part of CONTRACT 2: its shape is mirrored by
frontend/src/lib/contract.types.ts, so a drift fails the web build. Each trace is built deterministically from the
committed DES outputs (case-results.json, produced by the SAME TS DES the browser runs) + the learned-policy metrics
(dl-learned.json). It references the shared ONNX policies, never copies them."""
from __future__ import annotations

from typing import Any

TRACE_SCHEMA = "dispatchlab.trace/v1"


def build_trace(case: Any, *, case_result: dict, learned: dict) -> dict:
    return {
        "schema": TRACE_SCHEMA,
        "case_id": case.id,
        "name": case.name,
        "category": case.category,
        "real_or_synthetic": case.real_or_synthetic,
        "expected_band": case.expected_band,
        "scenario": {"n_shovels": case.n_shovels, "n_trucks": case.n_trucks, "truck_model": case.truck_model,
                     "shift_sec": case.shift_sec},
        # the multi-policy DES comparison for this case (medians + p10/p90 bands), from the TS engine
        "policies": case_result.get("policies", []),
        "pareto": case_result.get("pareto", []),
        "tie": case_result.get("tie"),
        # the learned-policy held-out metrics (global, referenced from dl-learned.json)
        "learned": {"policyImitAcc": learned.get("policyImitAcc"), "bcBestImitAcc": learned.get("bcBestImitAcc"),
                    "bestPolicy": learned.get("bestPolicy"), "nTrain": learned.get("nTrain"),
                    "nEval": learned.get("nEval")},
    }
