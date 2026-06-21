# 08 — The two data contracts

The full schemas live in [`../../data/README.md`](../../data/README.md); this is the architecture-level summary.

## Contract 1 — ingestion (dispatch scenario → pipeline)

`data-pipeline/dlab/io/contract.py`. The *bring-your-own-mine* gate. `validate_records` accepts a scenario row iff it
satisfies the schema (`n_shovels ∈ [1,40]`, `n_trucks ∈ [1,400]`, `truck_model ∈ {793F, 789D, 777G}`, `shift_sec ∈
[600,86400]`), **rejects** with a reason otherwise, and **flags** severely over/under-trucked fleets (match factor far
from 1 → dispatch barely matters / queues dominate). A committed `data/examples/scenarios.csv` PASSES Contract 1 (a
clone-time test asserts it).

## Contract 2 — artifact (pipeline → web)

`data-pipeline/dlab/core/{trace.py, manifest.py}`. Each case writes a compact `data/derived/<case>/trace.json`
(`dispatchlab.trace/v1`) + a manifest `data/derived/manifests/<case>.json` (`dispatchlab.manifest/v2`) recording the
category, seed, engine+version, the shared ONNX, the trace byte size, the lane/gate verdict, the Contract-1 flags, and
the case metrics; a flat `index.json` inventories all cases. `frontend/src/lib/contract.types.ts` mirrors these so a
drift fails `tsc`; `scripts/check_artifacts.py` (CI) enforces that every manifest points to a real trace of the
recorded byte size with a consistent lane verdict.
