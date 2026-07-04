# 02, Determinism & the replay trace

## Determinism

Every run is a pure function of `(case, seed)`. The DES uses a seedable xoshiro128** over named streams
(load/travel/dump) with a total-order `(time, priority, seq)` FEL key, so the same seed → identical timeline; the
case bake uses a fixed seed set; training seeds `torch.manual_seed(0)`. The light pipeline reads the committed
`case-results.json`, so re-running it produces **byte-identical** traces + manifests (the CI determinism guard), no
wall-clock in any committed artifact.

## The compact trace (`dispatchlab.trace/v1`)

`core/trace.py` builds one small JSON per case from the committed DES outputs (`case-results.json`) + the
learned-policy metrics (`dl-learned.json`). The payload carries the case's scenario (shovels/trucks/model/shift), the
multi-policy DES comparison (per policy: median tonnes + truck-wait + the p10/p90 bands + the Pareto flag), the Pareto
front + the TIE verdict, and the learned-policy held-out metrics (imitation accuracy, the best policy), referencing
the shared ONNX, not copying them.

The frontend mirrors this shape in `frontend/src/lib/contract.types.ts` (`CaseTrace` / `PolicyStat`), so a drift
between the Python trace and the TS reader **fails `tsc`**.
