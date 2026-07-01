# Changelog

## [0.06.000] — 2026-07-01

### Added — the REAL-DATA lane (issues #13-#18, #21; epic #20)
- **Pit topography + 3D view (#21):** parametric terraced pit (bench rings, spiral ramp) + a `Pit 3D` tab — the
  fleet moves along real 3D haul paths (bench → ramp → surface) at the playback clock; render-on-demand.
- **cyclelog/v1 client contract + replay engine (#15):** ingest real cycle logs (reject/flag/derive + provenance);
  fold a measured shift into the same SimResult every tab consumes; real dispatcher decisions extracted.
- **Structure-real shift artifacts (#17):** generated with the MIT OpenMines simulator (Huolinhe-desensitized
  config); 2 shifts shipped with honest provenance; gated through the contract.
- **First-level SOURCE selector (#14) + BYOD:** Synthetic | Real sample; sample picker; bring-your-own CSV through
  the same gate; provenance card; SCENARIO knobs lock in real mode (#16); measured cycle-time tab.
- **Counterfactual dispatch (#18):** re-decide the REAL shift under every policy (heuristics + learned) —
  per-policy agreement at each real decision point + a live-ONNX inspector on the reconstructed states.

### Fixed
- Playback now defaults PAUSED and halts on a hidden tab (no-autoplay/compute rules).
- Empirical match-factor formula (missing /nLoaders); non-monotonic replay crusher feed; node20 .ts test discovery.


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
