"""CONTRACT 1 (ingestion) tests: good dispatch scenarios validate; ill-formed ones are rejected with a reason;
severely over/under-trucked fleets are flagged; the committed example passes."""
from dlab.io.contract import validate_records


def test_good_scenario_accepted():
    rep = validate_records([{"case_id": "c", "n_shovels": 2, "n_trucks": 8, "truck_model": "793F", "shift_sec": 28800}])
    assert rep.ok and len(rep.accepted) == 1 and not rep.rejected
    assert rep.accepted[0].truck_model == "793F"


def test_bad_scenarios_rejected_not_coerced():
    rows = [
        {"case_id": "m", "n_shovels": 2, "n_trucks": 8, "truck_model": "F150", "shift_sec": 28800},   # bad model
        {"case_id": "s", "n_shovels": 0, "n_trucks": 8, "truck_model": "793F", "shift_sec": 28800},    # 0 shovels
        {"case_id": "t", "n_shovels": 2, "n_trucks": "lots", "truck_model": "793F", "shift_sec": 28800},  # non-numeric
        {"case_id": "h", "n_shovels": 2, "n_trucks": 8, "truck_model": "793F", "shift_sec": 10},        # shift too short
        {"case_id": "x", "n_shovels": 2, "n_trucks": 8, "truck_model": "793F"},                          # missing shift
    ]
    rep = validate_records(rows)
    assert len(rep.accepted) == 0 and len(rep.rejected) == len(rows)
    assert all("reason" in r for r in rep.rejected)


def test_over_trucked_flagged():
    rep = validate_records([{"case_id": "over", "n_shovels": 1, "n_trucks": 20, "truck_model": "793F", "shift_sec": 28800}])
    assert rep.ok and rep.flagged
    assert "over-trucked" in " ".join(rep.flagged[0]["flags"])


def test_committed_example_passes_contract():
    from pathlib import Path

    from dlab.io.formats import read_csv_rows

    csv = Path(__file__).resolve().parents[1] / "data" / "examples" / "scenarios.csv"
    rep = validate_records(read_csv_rows(csv))
    assert rep.ok and not rep.rejected, f"example scenarios.csv should pass Contract 1: {rep.summary()}"
