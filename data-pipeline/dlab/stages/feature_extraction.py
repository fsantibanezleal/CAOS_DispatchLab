"""Stage 2 — feature_extraction (heavy lane): the per-shovel decision features (queue/backlog/wait/distance, the
state encoding) are the SINGLE SOURCE OF TRUTH the web app reproduces (frontend/src/policies/learned.ts). The
encoding lives in the dataset generator + `dlab/science/train_policy.py`; the web reproduces it byte-for-byte."""
