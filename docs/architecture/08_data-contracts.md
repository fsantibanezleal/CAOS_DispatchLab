# 08, The two data contracts

The full schemas live in [`../../data/README.md`](../../data/README.md); this is the architecture-level summary.

## Contract 1, ingestion (dispatch scenario → pipeline)

`data-pipeline/dlab/io/contract.py`. The *bring-your-own-mine* gate. `validate_records` accepts a scenario row iff it
satisfies the schema (`n_shovels ∈ [1,40]`, `n_trucks ∈ [1,400]`, `truck_model ∈ {793F, 789D, 777G}`, `shift_sec ∈
[600,86400]`), **rejects** with a reason otherwise, and **flags** severely over/under-trucked fleets (match factor far
from 1 → dispatch barely matters / queues dominate). A committed `data/examples/scenarios.csv` passes Contract 1 (a
clone-time test asserts it).

## Contract 2, artifact (pipeline → web)

`data-pipeline/dlab/core/{trace.py, manifest.py}`. Each case writes a compact `data/derived/<case>/trace.json`
(`dispatchlab.trace/v1`) + a manifest `data/derived/manifests/<case>.json` (`dispatchlab.manifest/v2`) recording the
category, seed, engine+version, the shared ONNX, the trace byte size, the lane/gate verdict, the Contract-1 flags, and
the case metrics; a flat `index.json` inventories all cases. `frontend/src/lib/contract.types.ts` mirrors these so a
drift fails `tsc`; `scripts/check_artifacts.py` (CI) enforces that every manifest points to a real trace of the
recorded byte size with a consistent lane verdict.

## Contract 3, the real-sample lane (cyclelog/v1 + provenance + topo)

`frontend/src/replay/ingest.ts` (the client gate) + `data/examples/real/`. Every shipped or user-provided shift goes
through the same ingestion rules: CSV header exactly `t,truck_id,shovel_id,event,payload_t`; per-truck legal event
machine `load→haul→dump→return` with monotone times; payload ∈ [0, 400] t; ≥ 8 valid rows; shovel and dump rosters
non-empty (both-roles and empirical-MF anomalies flag, not reject). Event anchoring: deltas mean loading / loaded
travel / dumping / empty-travel+queue (locked with the generator, see minehaulsim's ADR-0003). Alongside each CSV:

- `<id>.provenance.json`, generator, seeds, dispatcher, kind (`structure-real`), license, honest caveats. The
  default samples come from **minehaulsim** (our published simulator, [PyPI](https://pypi.org/project/minehaulsim/),
  Apache-2.0), constrained road networks, rimpull speed-by-grade, emergent congestion, a structurally different
  validated mine per seed. OpenMines remains a labelled legacy comparison source only.
- `<id>.topo.json`, the `PitTopoSpec` of the real generated geometry (least-squares rim fit, bench count/height,
  shovel benches); `loadSample` attaches it so the Pit 3D renders the actual mine (underground samples carry
  `minetopo/v1`, awaiting its own 3D view).

The registry `public/data/real/index.json` is built at copy-data time from the provenance files (minehaulsim entries
first, the app's default sample never comes from the legacy generator).
