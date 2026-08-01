"""The offline pipeline orchestrator + CLI (ADR-0057). Per case it applies CONTRACT 1, builds the compact per-case
trace from the committed DES outputs (case-results.json) + the learned-policy metrics (dl-learned.json), runs the
lane gate, and writes the manifest + a flat index (CONTRACT 2). The committed ONNX + dl-learned + case-results ARE the
offline lane's real outputs, so the DEFAULT path is light (numpy/stdlib, no torch/node) and deterministic.
`--retrain` regenerates those artifacts (Node DES dataset -> torch train -> ONNX; re-bake case-results), see science/.

    python data-pipeline/run.py                 # rebuild all replay traces + manifests from committed artifacts
    python data-pipeline/run.py C05             # one case
    python data-pipeline/run.py all --retrain   # Node DES dataset + torch train, then rebuild
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from . import registry
from .core.manifest import build_index
from .io.contract import validate_records
from .io.formats import read_json, write_json
from .stages import export

REPO_ROOT = Path(__file__).resolve().parents[2]
DERIVED = REPO_ROOT / "data" / "derived"
MANIFESTS = DERIVED / "manifests"
SCIENCE = Path(__file__).resolve().parent / "science"

STAGES = ("preprocess", "feature_extraction", "train", "infer", "evaluate", "export")


def _load_artifacts() -> tuple[dict, dict]:
    need = ["case-results.json", "dl-learned.json"]
    missing = [n for n in need if not (DERIVED / n).exists()]
    if missing:
        raise SystemExit(
            f"missing committed artifacts in {DERIVED}: {missing}. case-results.json is baked by the TS DES "
            f"(science/bake_cases.mjs); dl-learned.json is the heavy lane's output, run --retrain to regenerate."
        )
    return read_json(DERIVED / "case-results.json"), read_json(DERIVED / "dl-learned.json")


def _contract_flags() -> list[dict]:
    """Apply CONTRACT 1 to the cases' dispatch scenarios, proves the ingestion gate, carries the MF flags."""
    rows = [{"case_id": c.id, "n_shovels": c.n_shovels, "n_trucks": c.n_trucks,
             "truck_model": c.truck_model, "shift_sec": c.shift_sec} for c in registry.list_cases()]
    return validate_records(rows).flagged


def precompute(case_id: str, seed: int = 42,
               artifacts: tuple[dict, dict] | None = None, flags: list[dict] | None = None) -> dict:
    case = registry.get_case(case_id)
    case_results, learned = artifacts if artifacts is not None else _load_artifacts()
    return export.build_replay(
        case, derived_dir=str(DERIVED), manifests_dir=str(MANIFESTS),
        case_results=case_results, learned=learned,
        contract_flags=(flags if flags is not None else _contract_flags()), seed=seed,
    )


def _node(*args: str) -> None:
    subprocess.run(["node", "--import", "tsx", *args], check=True, cwd=str(REPO_ROOT))


def retrain(seed: int = 42) -> None:
    """HEAVY lane (two-language): Node DES dataset (the SAME TS DES) -> torch train policies -> ONNX; re-bake case
    results. The science is preserved verbatim in pipeline/science/."""
    print("[retrain] node DES dataset generation (logs decisions) ...", flush=True)
    _node(str(SCIENCE / "gen_dataset.mjs"))
    print("[retrain] rollout benchmark + distillation dataset (Monte-Carlo rollout over the corpus) ...", flush=True)
    _node(str(SCIENCE / "rollout_bench.mjs"))
    print("[retrain] torch train the learned policies + distil the rollout -> ONNX ...", flush=True)
    vp = "python"
    subprocess.run([vp, str(SCIENCE / "train_policy.py")], check=True, cwd=str(REPO_ROOT))
    print("[retrain] re-bake case-results + synthetic benchmark (TS DES over the cases) ...", flush=True)
    _node(str(SCIENCE / "bake_cases.mjs"))
    _node(str(SCIENCE / "bench_synthetic.mjs"))
    print(f"[retrain] wrote ONNX (incl. dl-rollout) + dl-learned.json + case-results.json + bench/rollout.json -> {DERIVED}", flush=True)


def run_all(seed: int = 42) -> list[dict]:
    artifacts = _load_artifacts()
    flags = _contract_flags()
    entries = []
    for c in registry.list_cases():
        precompute(c.id, seed=seed, artifacts=artifacts, flags=flags)
        entries.append({"case_id": c.id, "category": c.category, "manifest_path": f"manifests/{c.id}.json"})
    write_json(MANIFESTS / "index.json", build_index(entries))
    return entries


def main() -> None:
    ap = argparse.ArgumentParser(prog="pipeline.pipeline")
    ap.add_argument("case", nargs="?", default="all", help="a case id, or 'all'")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--retrain", action="store_true",
                    help="regenerate the ONNX/dl-learned/case-results (Node DES + torch) before rebuilding")
    args = ap.parse_args()
    if args.retrain:
        retrain(args.seed)
    if args.case == "all":
        entries = run_all(args.seed)
        print(f"precomputed {len(entries)} cases -> {DERIVED}")
        for e in entries:
            print(f"  {e['case_id']:5s} [{e['category']}]")
        print(f"index -> {MANIFESTS / 'index.json'}")
    else:
        m = precompute(args.case, args.seed)
        print(f"precomputed {args.case}: lane={m['lane']} bytes={m['artifact']['bytes']} "
              f"metrics={m['metrics']} -> {DERIVED / m['artifact']['path']}")


if __name__ == "__main__":
    main()
