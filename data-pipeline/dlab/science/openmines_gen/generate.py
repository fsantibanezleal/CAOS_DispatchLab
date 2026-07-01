"""Generate STRUCTURE-REAL cycle-log shift samples with the MIT-licensed OpenMines simulator (issue #17).

Why OpenMines and not our own DES: the shipped real-sample must come from an EXTERNAL generator calibrated to a
real mine (OpenMines' north_pit_mine.json is desensitized from the Huolinhe open-pit coal mine, Sept 2022 —
arXiv:2404.00622), so the real-data lane is exercised by data our own engine did not fabricate (non-circular).
Verified 2026-07-01: no public ground-truthed open-pit FMS dispatch log is redistributable; these samples are
honestly labelled `structure-real` (see provenance.json written next to each CSV).

Runs the real OpenMines simulation (SimPy), captures its event log in memory, and folds it into cyclelog/v1
rows: (t, truck_id, shovel_id, event=load|haul|dump|return, payload_t), seconds from shift start.

Run (inside .venv-pipeline, which has openmines installed --no-deps + modern deps):
    python -m dlab.science.openmines_gen.generate
"""
from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OUT = REPO / "data" / "examples" / "real"
CONFIG = HERE / "north_pit_mine.json"

# event patterns from openmines truck.py logging (INFO + DEBUG)
P_LOAD = re.compile(r"Time:<([\d.]+)> Truck:\[(.+?)\] Start loading at shovel (\S+)")
P_HAUL = re.compile(r"Time:<([\d.]+)> Truck:\[(.+?)\] Finish loading at shovel (\S+)")
P_DUMP = re.compile(r"Time:<([\d.]+)> Truck:\[(.+?)\] Arrived at (\S*DumpSite\S*)")
P_RET = re.compile(r"Time:<([\d.]+)> Truck:\[(.+?)\] Finish unloading at dumper (\S+)")


class Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(record.getMessage())


def run_sim(dispatcher_name: str) -> tuple[list[str], dict]:
    from openmines.src.cli.run import load_config, run_dispatch_sim
    import openmines.src.dispatch_algorithms as algos
    import importlib
    import pkgutil

    config = load_config(str(CONFIG))
    # find the dispatcher class by name across the algorithms package
    dispatcher_cls = None
    for m in pkgutil.iter_modules(algos.__path__):
        mod = importlib.import_module(f"openmines.src.dispatch_algorithms.{m.name}")
        if hasattr(mod, dispatcher_name):
            dispatcher_cls = getattr(mod, dispatcher_name)
            break
    if dispatcher_cls is None:
        raise SystemExit(f"dispatcher {dispatcher_name} not found")

    cap = Capture()
    root = logging.getLogger()
    prev_level = root.level
    root.addHandler(cap)
    root.setLevel(logging.DEBUG)
    try:
        run_dispatch_sim(dispatcher_cls(), str(CONFIG))
    finally:
        root.removeHandler(cap)
        root.setLevel(prev_level)
    return cap.lines, config


def truck_payload_map(config: dict) -> dict[str, float]:
    """truck name prefix -> payload capacity (t), from the config's truck groups."""
    out: dict[str, float] = {}
    for grp in config.get("charging_site", {}).get("trucks", []):
        out[grp["type"]] = float(grp.get("capacity", 0))
    return out


def fold_cyclelog(lines: list[str], config: dict) -> list[dict]:
    """Parse the captured log into cyclelog/v1 rows (t in seconds, ids numeric)."""
    payloads = truck_payload_map(config)
    shovel_ids: dict[str, int] = {}
    dump_ids: dict[str, int] = {}
    truck_ids: dict[str, int] = {}
    rows: list[dict] = []

    def sid(name: str) -> int:
        return shovel_ids.setdefault(name, len(shovel_ids) + 1)

    def did(name: str) -> int:
        return dump_ids.setdefault(name, 100 + len(dump_ids) + 1)

    def tid(name: str) -> int:
        return truck_ids.setdefault(name, len(truck_ids) + 1)

    def payload_of(truck_name: str) -> float:
        for prefix, cap in payloads.items():
            if truck_name.startswith(prefix):
                return cap
        return 0.0

    last_shovel: dict[str, str] = {}
    for ln in lines:
        m = P_LOAD.search(ln)
        if m:
            t, truck, shovel = m.groups()
            last_shovel[truck] = shovel
            rows.append({"t": round(float(t) * 60, 1), "truck_id": tid(truck), "shovel_id": sid(shovel), "event": "load", "payload_t": 0})
            continue
        m = P_HAUL.search(ln)
        if m:
            t, truck, _shovel = m.groups()
            # use the shovel of THIS truck's preceding load (start/finish log lines can carry different name forms)
            shovel = last_shovel.get(truck, _shovel)
            rows.append({"t": round(float(t) * 60, 1), "truck_id": tid(truck), "shovel_id": sid(shovel), "event": "haul", "payload_t": payload_of(truck)})
            continue
        m = P_DUMP.search(ln)
        if m:
            t, truck, dump = m.groups()
            rows.append({"t": round(float(t) * 60, 1), "truck_id": tid(truck), "shovel_id": did(dump), "event": "dump", "payload_t": payload_of(truck)})
            continue
        m = P_RET.search(ln)
        if m:
            t, truck, dumper = m.groups()
            # dumper name carries the dump-site prefix; map to its dump id
            base = dumper.split("-Dumper")[0] if "-Dumper" in dumper else dumper
            key = next((k for k in dump_ids if k.startswith(base) or base.startswith(k)), base)
            rows.append({"t": round(float(t) * 60, 1), "truck_id": tid(truck), "shovel_id": did(key), "event": "return", "payload_t": 0})

    rows.sort(key=lambda r: (r["truck_id"], r["t"]))
    # enforce the legal per-truck machine load->haul->dump->return (drop out-of-order stragglers, e.g. shift-end cuts)
    clean: list[dict] = []
    NEXT = {"load": "haul", "haul": "dump", "dump": "return", "return": "load"}
    state: dict[int, str] = {}
    for r in rows:
        want = NEXT.get(state.get(r["truck_id"], "return"), "load")
        if r["event"] == want:
            clean.append(r)
            state[r["truck_id"]] = r["event"]
    clean.sort(key=lambda r: r["t"])
    return clean


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    shifts = [("naive", "NaiveDispatcher"), ("nearest", "NearestDispatcher"), ("random", "RandomDispatcher")]
    written = []
    for tag, disp in shifts:
        lines, config = run_sim(disp)
        rows = fold_cyclelog(lines, config)
        if len(rows) < 50:
            print(f"  !! {tag}: only {len(rows)} rows — skipping")
            continue
        name = f"huolinhe-northpit-{tag}"
        csv_path = OUT / f"{name}.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["t", "truck_id", "shovel_id", "event", "payload_t"])
            w.writeheader()
            w.writerows(rows)
        prov = {
            "id": name,
            "name": f"North-pit shift ({disp})",
            "schema": "dispatchlab.cyclelog/v1",
            "kind": "structure-real",
            "source": "Generated with the MIT-licensed OpenMines simulator (github.com/370025263/openmines, arXiv:2404.00622), north_pit_mine.json config desensitized from the Huolinhe open-pit coal mine (Sept 2022).",
            "generator": {"dispatcher": disp, "sim_time_min": config.get("sim_time"), "openmines": "0.2.0"},
            "license": "MIT (generator + config); generated rows CC0",
            "caveats": "Synthetic cycle log (structure-real): no ground-truthed open-pit FMS dispatch log is public (verified 2026-07-01). Coal-mine config; domain-transfer caveat vs Cu open-pit.",
        }
        (OUT / f"{name}.provenance.json").write_text(json.dumps(prov, indent=2), encoding="utf-8")
        written.append((name, len(rows)))
        print(f"  wrote {csv_path.name}: {len(rows)} rows")
    print(f"done: {written}")


if __name__ == "__main__":
    main()
