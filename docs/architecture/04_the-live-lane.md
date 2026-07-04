# 04, The live lane (client-side)

DispatchLab's live lane is the **pure-TypeScript DES + onnxruntime-web**, not Pyodide. The archetype permits either
("Pyodide + lightweight wheels, OR a small TS engine"), DispatchLab's DES is the SAME logic the offline dataset
generator logged, so the live lane is faithful.

## The DES engine (`frontend/src/sim/`)

* `des.ts` / `heap.ts`, a next-event time-advance loop with an integer-tick (centisecond) clock and a binary-min-heap
  future-event list keyed on a total-order `(time, priority, seq)` tuple.
* `kinematics.ts`, truck haul times from rimpull/grade physics (793F anchored at 218 t / ~1976 kW / 60 km/h).
* `matchfactor.ts`, closed-form match-factor theory (the over-trucking knee at MF=1).
* `model.ts` / `cases.ts`, the pit model + the 12 case specs; `compare.ts`, the multi-policy comparison (Pareto + TIE).

## Policies (`frontend/src/policies/`)

* `heuristics.ts`, the 5 classical heuristics: greedy (earliest completion), shortest-expected-wait, the two classic
  criteria (min-truck-wait / min-shovel-wait), fixed assignment.
* `or.ts` / `hungarian.ts`, the OR tier: joint truck→shovel-slot assignment (Hungarian, Kuhn–Munkres) over the
  fleet view.
* `learned.ts` / `learnedRegistry.ts`, the two learned policies run a synchronous TS forward of the weights in the
  DES; `lib/ort.ts` runs the canonical ONNX (`dl-policy.onnx` / `dl-bcbest.onnx`) via onnxruntime-web in the
  decision-inspector, serialised per model.

## Live-vs-offline parity (the thing to guard)

The browser's state encoding (the per-shovel decision features) must match the offline dataset generator's encoding
byte-for-byte, or the ONNX scores garbage. The `featOrder` in `dl-learned.json` is the contract; `learned.ts`
reproduces it. The onnxruntime-web npm version and the `wasmPaths` CDN are pinned to the same version (1.27).
