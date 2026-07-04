"""The measured live-vs-precompute GATE (ADR-0054), adapted for DispatchLab's client-side lane.

DispatchLab runs its discrete-event dispatch simulation ENTIRELY in the browser, a pure-TypeScript DES + the learned
policies (a synchronous TS forward of the weights in the DES, and onnxruntime-web for the canonical ONNX in the
decision-inspector). A case runs LIVE iff it is client-side AND its runtimes are a subset of the deployed set AND a
shift simulation + its replay trace are within budget; otherwise it is PRECOMPUTE. A shift DES over a few seeds is
milliseconds-to-seconds and the traces are small, so every case passes. The verdict + budgets go into the manifest;
CI fails on mislabeling. A MEASUREMENT, never a hand-wave."""
from __future__ import annotations

LIVE_RUNTIMES: set[str] = {"ts-des", "onnxruntime-web"}
RUN_MS_GATE = 1500.0
TRACE_BYTES_GATE = 256 * 1024


def classify_lane(*, client_side: bool, runtimes: set[str], run_ms: float, trace_bytes: int) -> dict:
    reasons: list[str] = []
    live = True
    if not client_side:
        live = False
        reasons.append("not client-side (needs a server)")
    extra = set(runtimes) - LIVE_RUNTIMES
    if extra:
        live = False
        reasons.append(f"runtimes not in the deployed client set: {sorted(extra)}")
    if run_ms > RUN_MS_GATE:
        live = False
        reasons.append(f"runtime exceeds the {RUN_MS_GATE:.0f}ms budget")
    if trace_bytes > TRACE_BYTES_GATE:
        live = False
        reasons.append(f"trace_bytes {trace_bytes} > {TRACE_BYTES_GATE}")
    return {
        "lane": "live" if live else "precompute",
        "client_side": client_side,
        "runtimes": sorted(runtimes),
        "trace_bytes": trace_bytes,
        "run_ms_budget": RUN_MS_GATE,
        "trace_bytes_budget": TRACE_BYTES_GATE,
        "reasons": reasons,
    }
