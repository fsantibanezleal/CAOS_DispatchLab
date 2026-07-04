# 03, The lane gate

`core/gate.py::classify_lane` is the **measured** decision of whether a case runs live in the browser or is replayed
(ADR-0054). For DispatchLab the SIR-template's "Pyodide-safe wheels" become **client-side runtimes**: the live lane is
the TypeScript DES (`ts-des`) + `onnxruntime-web` (the learned policies in the decision-inspector).

A case is classified **live** iff:

1. it is **client-side** (no server needed), AND
2. its runtimes ⊆ `{ts-des, onnxruntime-web}` (the deployed client set), AND
3. a shift simulation over a few seeds fits the interaction budget (`run_ms ≤ 1500`), AND
4. its replay trace is small (`trace_bytes ≤ 256 KB`).

A full-shift DES over a handful of seeds is milliseconds-to-seconds and the traces are small, so **every** DispatchLab
case passes the gate. The verdict + the deterministic budgets are stamped into each manifest;
`scripts/check_artifacts.py` (CI) fails if a manifest's `lane` disagrees with its `gate.lane`. A measurement, never a
hand-wave.
