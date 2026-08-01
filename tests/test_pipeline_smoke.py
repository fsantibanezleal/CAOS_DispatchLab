"""Pipeline smoke + determinism: a case regenerates deterministically (same seed -> identical trace), run_all writes
the flat index covering every category."""
import json

from pipeline import pipeline, registry


def test_case_deterministic_same_seed():
    a = pipeline.precompute("C06", seed=7)
    b = pipeline.precompute("C06", seed=7)
    assert a["artifact"]["bytes"] == b["artifact"]["bytes"]
    trace = json.loads((pipeline.DERIVED / a["artifact"]["path"]).read_text(encoding="utf-8"))
    assert trace["category"] in registry.list_categories()


def test_run_all_writes_index():
    entries = pipeline.run_all(seed=42)
    assert len(entries) == len(registry.list_cases())   # the round-2 corpus: 3 simple + 5 complex/boss
    idx = json.loads((pipeline.MANIFESTS / "index.json").read_text(encoding="utf-8"))
    assert idx["n_cases"] == len(entries)
    assert idx["schema"].startswith("dispatchlab.index/")
    cats = {e["category"] for e in idx["cases"]}
    assert cats == set(registry.list_categories())
