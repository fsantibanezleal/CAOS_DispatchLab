"""CONTRACT 2 (artifact) tests: a manifest points to a real trace with the recorded byte size, the lane verdict is
consistent with the gate, and the schema is the DispatchLab one. Uses the committed case-results.json (no torch/node)."""
from dlab import pipeline


def test_manifest_matches_artifact_and_gate():
    m = pipeline.precompute("C05", seed=7)
    artifact = pipeline.DERIVED / m["artifact"]["path"]
    assert artifact.exists() and artifact.stat().st_size == m["artifact"]["bytes"]
    assert m["schema"].startswith("dispatchlab.manifest/")
    assert m["lane"] == m["gate"]["lane"] == "live", f"expected live, got {m['lane']} ({m['gate']['reasons']})"
    assert m["category"].startswith("multi-shovel")


def test_oracle_case_trace():
    import json

    m = pipeline.precompute("C12", seed=7)
    trace = json.loads((pipeline.DERIVED / m["artifact"]["path"]).read_text(encoding="utf-8"))
    assert trace["scenario"]["n_shovels"] == 1 and trace["scenario"]["n_trucks"] == 1
    assert len(trace["policies"]) >= 1   # the multi-policy comparison is present
