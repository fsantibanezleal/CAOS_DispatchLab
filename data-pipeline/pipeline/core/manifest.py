"""CONTRACT 2, artifact (pipeline -> web). The manifest is the authoritative, versioned record of a baked case: its
category, seed, engine+version, the shared learned-policy ONNX, the compact per-case trace pointer + byte size, the
lane/gate verdict, the CONTRACT-1 flags, and the case metrics. The web loads ONLY manifests + traces + the shared
artifacts; frontend/src/lib/contract.types.ts mirrors this schema so a drift fails the build. The committed ONNX +
dl-learned.json + case-results.json ARE the real outputs of the offline lane; the manifest records that the learned
policies are HONEST, competitive with (not fabricated wins over) the heuristics that taught them."""
from __future__ import annotations

from typing import Any

from .. import __version__
from .trace import TRACE_SCHEMA

MANIFEST_SCHEMA = "dispatchlab.manifest/v2"
INDEX_SCHEMA = "dispatchlab.index/v1"

ENGINE_NOTE = ("deterministic discrete-event truck-shovel DES (next-event time-advance, binary-heap FEL, seedable "
               "streams) + rimpull/grade kinematics + 5 classical policies + 2 learned ONNX policies "
               "(reward-weighted imitation + BC-best).")
HONESTY = ("The DES is a deterministic SIMULATION, NOT a real plant. The two learned policies are COMPETITIVE, "
           "within ~1%, matching the best heuristic (their teacher), NOT beating it; no fabricated RL win. The "
           "value is a single fast learned dispatcher recovered from logged DES decisions + live inference.")


def shared_artifacts() -> dict:
    return {
        "models": [
            {"id": "dl-policy", "file": "dl-policy.onnx", "opset": 17, "kind": "reward-weighted imitation policy"},
            {"id": "dl-bcbest", "file": "dl-bcbest.onnx", "opset": 17, "kind": "behaviour-clone of the best heuristic"},
        ],
        "learned_metrics": "dl-learned.json",
        "case_results": "case-results.json",
    }


def build_case_manifest(*, case: Any, seed: int, artifact_rel: str, trace_bytes: int,
                        gate: dict, flags: list[dict], metrics: dict) -> dict:
    return {
        "schema": MANIFEST_SCHEMA,
        "case_id": case.id,
        "name": case.name,
        "category": case.category,
        "real_or_synthetic": case.real_or_synthetic,
        "expected_band": case.expected_band,
        "validation_anchor": case.validation_anchor,
        "engine": {"package": "pipeline", "version": __version__, "model": ENGINE_NOTE},
        "seed": seed,
        "shared": shared_artifacts(),
        "artifact": {"path": artifact_rel, "format": "json", "trace_schema": TRACE_SCHEMA, "bytes": trace_bytes},
        "lane": gate["lane"],
        "gate": gate,
        "flags": flags,
        "metrics": metrics,
        "honesty": HONESTY,
    }


def build_index(entries: list[dict]) -> dict:
    return {
        "schema": INDEX_SCHEMA,
        "engine_version": __version__,
        "n_cases": len(entries),
        "cases": sorted(entries, key=lambda e: e["case_id"]),
    }
