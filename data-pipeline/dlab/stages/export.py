"""Stage 6 — export (CONTRACT 2): build the compact per-case trace from the committed DES outputs (case-results.json)
+ the learned-policy metrics (dl-learned.json), run the lane gate, and write the manifest. No torch/node — so the
contract + replay regenerate deterministically anywhere, and CI stays fast. The HEAVY export (writing the ONNX
policies + dl-learned.json + case-results.json) is done by the preserved science (science/train_policy.py +
science/bake_cases.mjs), invoked by pipeline.retrain."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from ..core.gate import classify_lane
from ..core.manifest import build_case_manifest
from ..core.trace import build_trace
from ..io.formats import write_json

_RUN_MS = 50.0   # a shift DES over a few seeds — milliseconds-to-seconds; deterministic gate budget
_RUNTIMES = {"ts-des", "onnxruntime-web"}


def _case_metrics(case_result: dict, learned: dict) -> dict:
    pols = case_result.get("policies", [])
    best = max((p.get("medTonnes", 0.0) for p in pols), default=0.0)
    return {"n_policies": len(pols), "best_med_tonnes": round(float(best), 1),
            "policy_imit_acc": learned.get("policyImitAcc", 0.0),
            "bcbest_imit_acc": learned.get("bcBestImitAcc", 0.0)}


def build_replay(case: Any, *, derived_dir: str, manifests_dir: str,
                 case_results: dict, learned: dict, contract_flags: list[dict], seed: int) -> dict:
    cr = case_results["cases"][case.id]
    trace = build_trace(case, case_result=cr, learned=learned)
    artifact_rel = f"{case.id}/trace.json"
    trace_bytes = write_json(Path(derived_dir) / artifact_rel, trace)
    gate = classify_lane(client_side=True, runtimes=_RUNTIMES, run_ms=_RUN_MS, trace_bytes=trace_bytes)
    manifest = build_case_manifest(
        case=case, seed=seed, artifact_rel=artifact_rel, trace_bytes=trace_bytes,
        gate=gate, flags=contract_flags, metrics=_case_metrics(cr, learned),
    )
    write_json(Path(manifests_dir) / f"{case.id}.json", manifest)
    return manifest
