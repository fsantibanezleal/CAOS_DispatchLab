"""dlab — the offline+live engine for DispatchLab (instantiated from the CAOS product-repo archetype, ADR-0057).

The CORE is real and SOTA-pinned: a deterministic discrete-event truck-shovel dispatch simulator (next-event
time-advance, binary-heap FEL, seedable streams) with rimpull/grade truck kinematics and match-factor theory; five
classical dispatch policies (greedy / shortest-wait / the two min-wait criteria / fixed); and two LEARNED dispatch
policies (reward-weighted imitation + behaviour-clone of the best heuristic) trained OFFLINE on logged DES decisions
and exported to ONNX for live in-browser inference. The base around it (the two data contracts, the staged pipeline,
the lane gate, the manifest/trace, the cases-by-category registry) is the FROZEN archetype — instantiated here.

Offline lane is two-language: a Node dataset generator (`science/gen_dataset.mjs`, the SAME TS DES — no Python
re-port) logs decisions; Python (`science/train_policy.py`) fits the ONNX policies. The default pipeline is
numpy-only and rebuilds the replay from the committed artifacts.
"""

__version__ = "0.12.000"  # display X.XX.XXX; PEP 440 form in pyproject.toml (0.12.0)
