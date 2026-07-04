"""LIVE lane entrypoint, DORMANT for DispatchLab.

The archetype's reference live lane is Pyodide running this module in the browser. DispatchLab instead implements its
live lane as the pure-TypeScript discrete-event dispatch simulator (frontend/src/sim/*) + onnxruntime-web running the
EXPORTED learned-policy ONNX in the decision-inspector, explicitly permitted by the archetype ("Pyodide + lightweight
wheels, OR a small TS engine"). The DES runs the same logic the offline dataset generator logged, so this Pyodide
entrypoint is present-but-dormant; the gate (core/gate.py) still classifies each case's lane."""
from __future__ import annotations


def run_trace_json(*_args, **_kwargs):  # pragma: no cover - dormant
    raise NotImplementedError(
        "DispatchLab's live lane is the TS DES + onnxruntime-web (frontend/), not Pyodide. This entrypoint is dormant."
    )
