# Changelog

All notable changes to CAOS DispatchLab are documented here. Versions follow `X.XX.XXX` (major.minor.patch); the
project stays in `0.x` while the DES is a didactic simulation (pending heavier OR/RL tiers).

## [0.05.000] — 2026-06-21

Refactor onto the CAOS product-repo archetype (ADR-0057) — the science core is unchanged; the repo is now a real,
contract-bounded, staged offline pipeline + a frontend SPA.

### Changed
- **`tools/dispatch-rl/` → `data-pipeline/dlab/`** — the Node DES dataset generator + the torch policy training
  preserved verbatim under `dlab/science/` (the heavy lane); the six named stages are thin wrappers over it.
- **`src/` → `frontend/src/`**; `public/{dl-policy,dl-bcbest}.onnx` + `dl-learned.json` → **`data/derived/`** (the
  canonical artifact home). `frontend/copy-data.mjs` overlays them back into `public/` at build (the SPA's fetch paths
  are unchanged).
- The default pipeline is **numpy-only**: `python -m dlab.pipeline all` rebuilds every per-case replay trace +
  manifest from the committed `case-results.json` (the 8 cases baked by the TS DES) + `dl-learned.json`. `--retrain`
  regenerates everything (Node DES dataset → torch train → ONNX → re-bake).

### Fixed
- **App design rule: the play/pause + speed controls moved from the global sidebar into the Pit-map tab.** They drive
  only the pit-map animation (a subgroup of one tab), so per the archetype rule (a control that affects only a subset
  of tabs must be scoped to those tabs, not a global bar) they now live with the animation + scrubber they control.
  All 11 App tabs react to the case/policy/seed selectors.

### Added
- **Two data contracts**: Contract 1 (`io/contract.py` — dispatch-scenario schema + match-factor outlier policy) and
  Contract 2 (`core/manifest.py` `dispatchlab.manifest/v2` + `core/trace.py` `dispatchlab.trace/v1`), with a TS mirror
  (`frontend/src/lib/contract.types.ts`) that fails `tsc` on drift.
- **Cases by category** (`cases/dispatch_cases.py`): the 8-case matrix (single-shovel MF sweep C01-C03; multi-shovel
  C04-C07; the C12 1×1 oracle control).
- The client-side **lane gate**, two venvs + per-lane requirements, cross-platform `scripts/`, `tests/`
  (contract/manifest/smoke), CI (`ci.yml`) + `deploy-pages.yml`, a `docs/` wiki (ADR-0056), a dormant `app/` FastAPI +
  VPS templates, and the root `CHANGELOG.md` + `STRUCTURE.md` + `LICENSES.md` + `ATTRIBUTION.md`.
- Verified running: ruff clean · pytest 8/8 · pipeline 8 cases · CONTRACT 2 OK · deterministic re-run ·
  `tsc + vite build` green · no venv/jsonl/dll leaks.
