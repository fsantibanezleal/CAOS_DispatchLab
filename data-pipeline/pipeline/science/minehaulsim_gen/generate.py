"""Generate STRUCTURE-REAL cycle-log samples with minehaulsim (issue #30, replaces OpenMines
as the default structure-real source).

Why minehaulsim: a deterministic DES on a CONSTRAINED road network (one-way ramps, rimpull
speed-by-grade, single-lane direction zones, junctions, emergent bunching) with seeded
parametric generators, every sample comes from a STRUCTURALLY different validated mine, and
each ships the topography of the REAL generated geometry so the 3D view renders it faithfully.
OpenMines remains an optional legacy generator (single fixed mine, scalar distances, no grades).

Set (blueprint): 6 varied open pits (small/mid spiral+switchback get BOTH minqueue and nearest
for policy comparison; deep single-lane spiral, dual-ramp one-way circulation, 2-crusher, and a
3-phase eccentric pit get one each) + 2 underground mines (lhd_orepass_truck, truck_direct).
Every sample: cyclelog CSV (validated with the SAME rules the app's ingest applies, the
minehaulsim port is faithful) + provenance JSON + topo JSON.

Run (inside .venv-pipeline, which has minehaulsim==0.12.0 pinned):
    python -m pipeline.science.minehaulsim_gen.generate
"""
from __future__ import annotations

import json
from pathlib import Path

from minehaulsim.des.dispatch import MinQueuePolicy, NearestPolicy
from minehaulsim.io import validate_cyclelog, write_cyclelog
from minehaulsim.scenarios import (MineSpec, OpenPitParams, UndergroundParams,
                                   attach_geology, generate_open_pit, generate_underground)

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OUT = REPO / "data" / "examples" / "real"

MINEHAULSIM_VERSION = "0.12.0"
SHIFT_MIN = 480.0
SIM_SEED = 7

# per open-pit family: which oreblocks deposit archetype grounds its geology. Underground samples
# are left ungeologised (the geology contract is open-pit v1). Grade grounding lets the App show
# the real bench + face grade + ore fraction behind each shovel, from the EXACT ultimate pit.
GEOLOGY_ARCHETYPE = {
    "pit-small-spiral": "porphyry",
    "pit-mid-switchback": "vein",
    "pit-deep-spiral": "porphyry",
    "pit-dual-ramp": "core_halo",
    "pit-two-crushers": "porphyry",
    "pit-three-phase": "layered",
}

# (sample tag, scenario factory, policies to run)
SCENARIOS: list[tuple[str, object, list[str]]] = [
    ("pit-small-spiral",
     lambda: generate_open_pit(OpenPitParams(
         name="pit-small-spiral", n_benches=7, ramp_style="spiral", n_shovels=2,
         n_crushers=1, n_waste_dumps=1, stockpile=False, n_surface_junctions=1), seed=101),
     ["minqueue", "nearest"]),
    ("pit-mid-switchback",
     lambda: generate_open_pit(OpenPitParams(
         name="pit-mid-switchback", n_benches=10, ramp_style="switchback",
         n_shovels=4, n_crushers=1, n_waste_dumps=2), seed=202),
     ["minqueue", "nearest"]),
    ("pit-deep-spiral",
     lambda: generate_open_pit(OpenPitParams(
         name="pit-deep-spiral", n_benches=16, ramp_style="spiral", ramp_lanes=1,
         zone_policy="loaded_priority"), seed=303),
     ["minqueue"]),
    ("pit-dual-ramp",
     lambda: generate_open_pit(OpenPitParams(
         name="pit-dual-ramp", ramp_style="dual_spiral", ramp_lanes=1, n_shovels=5), seed=404),
     ["minqueue"]),
    ("pit-two-crushers",
     lambda: generate_open_pit(OpenPitParams(
         name="pit-two-crushers", n_crushers=2, n_waste_dumps=2, n_shovels=6,
         n_surface_junctions=3), seed=505),
     ["minqueue"]),
    ("pit-three-phase",
     lambda: generate_open_pit(OpenPitParams(
         name="pit-three-phase", n_phases=3, eccentricity=1.8, n_shovels=6), seed=606),
     ["nearest"]),
    ("ug-lhd-orepass",
     lambda: generate_underground(UndergroundParams(
         name="ug-lhd-orepass", flow_mode="lhd_orepass_truck", n_levels=6), seed=707),
     ["minqueue"]),
    ("ug-truck-direct",
     lambda: generate_underground(UndergroundParams(
         name="ug-truck-direct", flow_mode="truck_direct", n_levels=5), seed=808),
     ["minqueue"]),
]

POLICIES = {"minqueue": MinQueuePolicy, "nearest": NearestPolicy}


def _summary(spec: MineSpec) -> str:
    p = spec.params
    if spec.kind == "openpit":
        return (f"{p['n_benches']} benches x {p['bench_height_m']} m, {p['ramp_style']} ramp "
                f"({p['ramp_lanes']} lane), {len(spec.loaders)} shovels, {len(spec.dumps)} "
                f"dumps, {len(spec.trucks)} trucks")
    return (f"{p['n_levels']} levels, {p['access_style']} decline "
            f"{p['decline_grade_pct']}%, flow {p['flow_mode']}, {len(spec.loaders)} loading "
            f"points, {len(spec.trucks)} trucks, {p['n_lhds']} LHDs")


def export_sample(spec: MineSpec, policy_name: str) -> dict:
    sample_id = f"mhs-{spec.name}-{policy_name}"
    res = spec.run(POLICIES[policy_name](), seed=SIM_SEED, until_s=SHIFT_MIN * 60.0)
    n = write_cyclelog(res.events, OUT / f"{sample_id}.csv")
    rep = validate_cyclelog(OUT / f"{sample_id}.csv")
    if not rep.ok:
        raise SystemExit(f"{sample_id}: export fails the ingest contract: {rep.rejected}")

    prov = {
        "id": sample_id,
        "name": f"{spec.name} shift ({policy_name})",
        "schema": "dispatchlab.cyclelog/v1",
        "kind": "structure-real",
        "source": (f"Generated with minehaulsim {MINEHAULSIM_VERSION} "
                   "(pypi.org/project/minehaulsim, Apache-2.0): deterministic DES on a "
                   "constrained road network (rimpull speed-by-grade, direction zones, "
                   "emergent bunching), seeded parametric mine generator."),
        "generator": {"package": "minehaulsim", "version": MINEHAULSIM_VERSION,
                      "scenario_seed": spec.seed, "sim_seed": SIM_SEED,
                      "dispatcher": policy_name, "sim_time_min": int(SHIFT_MIN),
                      "mine_kind": spec.kind, "scenario": _summary(spec)},
        "license": "Apache-2.0 (generator); generated rows CC0",
        "caveats": ("Synthetic cycle log (structure-real): the road network, grades, speeds and "
                    "queueing are simulated physics; the mine itself is generated, not a real "
                    "operation. Equipment curves are class-representative, not OEM data. "
                    "No calibration to any specific mine is claimed."),
    }
    # geology grounding (issue #50): when the scenario was geologised (attach_geology), carry the
    # per-shovel face stamps + the exact-pit provenance in the provenance JSON (scenario metadata,
    # NOT the cyclelog rows, cyclelog/v1 stays byte-identical, so every existing consumer is
    # unaffected). The App joins face grade to the per-shovel view by shovel node_id.
    geo = spec.materials.get("geology")
    if geo is not None:
        prov["geology"] = {
            "engine": geo.get("engine", "oreblocks"),
            "archetype": geo["archetype"],
            "cutoffGrade": geo["cutoff_grade"],
            "stampedPitValue": geo["stamped_pit_value"],
            "gradeUnit": "mass fraction",
            "faces": [
                {"shovelId": int(x["node_id"]), "bench": int(x["face_bench"]),
                 "grade": round(float(x["face_grade"]), 6),
                 "oreFraction": round(float(x["face_ore_fraction"]), 4),
                 "levelTonnes": round(float(x["face_level_tonnes"]), 1)}
                for x in spec.loaders if "face_grade" in x
            ],
            "note": ("SYNTHETIC bench-aligned deposit (oreblocks): per-bench statistics of the "
                     "EXACT ultimate pit. Vertical axis matches the pit benches; the horizontal "
                     "footprint is generic, not the haulage superellipse."),
        }
    (OUT / f"{sample_id}.provenance.json").write_text(json.dumps(prov, indent=2) + "\n",
                                                      encoding="utf-8")
    if spec.topo:
        (OUT / f"{sample_id}.topo.json").write_text(json.dumps(spec.topo, indent=1) + "\n",
                                                    encoding="utf-8")
    print(f"  wrote {sample_id}: {n} rows, {res.tonnes:.0f} t, {res.cycles} cycles"
          + (f", flags {rep.flags}" if rep.flags else ""))
    return {"id": sample_id, "name": prov["name"], "kind": "structure-real",
            "csv": f"{sample_id}.csv",
            **({"topo": f"{sample_id}.topo.json"} if spec.topo else {})}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    for tag, factory, policies in SCENARIOS:
        spec = factory()
        archetype = GEOLOGY_ARCHETYPE.get(spec.name)
        if archetype is not None and spec.kind == "openpit":
            spec = attach_geology(spec, archetype=archetype)  # deterministic in (spec, archetype, seed)
        (OUT / f"mhs-{spec.name}.minespec.json").write_text(spec.to_json(), encoding="utf-8")
        for policy_name in policies:
            entries.append(export_sample(spec, policy_name))
    (OUT / "mhs-index.json").write_text(json.dumps({"samples": entries}, indent=1) + "\n",
                                        encoding="utf-8")
    print(f"done: {len(entries)} samples -> {OUT}")


if __name__ == "__main__":
    main()
