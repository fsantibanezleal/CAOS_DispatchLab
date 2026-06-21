"""Stage 1 — preprocess (heavy lane): generate the labelled dispatch-decision dataset by running the SAME TypeScript
DES the browser runs (logs each shovel-assignment decision with its features + the heuristic-chosen action + the
episode tonnes). Delegates to the preserved science `dlab/science/gen_dataset.mjs` (Node + tsx), invoked by
`pipeline.retrain`. No Python re-port of the DES — the lesson from the sibling products."""
