# Frameworks & methods

The research made binding: every engine DispatchLab depends on is pinned (`requirements-precompute.txt` /
`frontend/package.json`) and documented here. Engine cards cover what/why/install/use; method cards cover the
algorithm + its provenance.

## Engines

| Card | Pin | Lane |
|---|---|---|
| [The TS DES engine](01_des-engine/des.md) | `frontend/src/sim/` | live + the offline decision-log source |
| [PyTorch](02_pytorch/pytorch.md) | `torch==2.12.1` (CPU) | offline (train) |
| [ONNX / onnxruntime / onnxruntime-web](03_onnx-onnxruntime/onnx.md) | `onnx==1.22.0`, `onnxruntime==1.27.0`, `onnxruntime-web^1.27.0` | offline export + live inference |
| [NumPy](04_numpy/numpy.md) | `numpy==2.4.6` | the light replay lane |

## Methods

| Card | Provenance |
|---|---|
| [Dispatch policies + match factor](05_policies/policies.md) | the classical criteria (min-truck-wait / min-shovel-wait); match factor (Morgan/Peterson; Burt & Caccetta) |
| [Learned dispatch policies](06_learned-dispatch/learned.md) | reward-weighted imitation + behaviour cloning from logged DES decisions |

DOI-verified references are in `frontend/src/data/citations.ts` and surfaced in the Methodology page.
