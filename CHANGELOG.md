# Changelog

## [0.12.000] — 2026-07-03

### Changed — selection & page UX pass (Felipe's review)
- **Sample/case selection redesigned** (#47): sample FAMILIES as mini-tabs (open-pit /
  underground / openmines) with a dot marking the active sample's family; chips read
  `deep-spiral · minqueue` instead of raw ids; provenance folds into a one-line summary
  (contract flags stay visible); real mode shows one-line facts instead of locked
  grey blocks — the Case grid, constraints chips, policy chips and seed slider are
  synthetic-only.
- **Benchmark made compact + interactive** (#49): the corpus and counterfactual tabs render
  ONE selected case/shift behind chip pickers with a collapsible clickable overview table
  (`.dl-fold`) — no more giant scroll (~1.3k px per tab, was 12 stacked bar blocks each).

### Added
- **50× replay speed** (#48) — the slow lane for close visual review of queueing, spotting
  and bunching (SPEEDS = [50, 200, 600, 1800]).


## [0.11.000] — 2026-07-02

### Added — the striking 3D pass + the underground view (#21)
- **Underground 3D** (`viz/Underground3D.tsx`): the REAL generated mine skeleton from
  `minehaulsim.minetopo/v1` — the decline as a tube along the true polyline, level platforms
  with depth labels, drawpoints, ore-pass tip→chute drops, the shaft bin — and the truck fleet
  animated ALONG THE DECLINE on haul legs (queued/serving trucks at their markers;
  representational mapping stated in the panel). Same on-demand render discipline as Pit3D.
  `loadSample` attaches minetopo to underground samples; the tab renames to "Mine 3D".
- **Pit 3D impact pass:** sprite text labels (S1..Sn on their bench, crusher/dump at the rim,
  theme-aware), depth-cue fog and a subtle rim light.
- **Field-found robustness fix (via the visual verifier):** a lost WebGL context (GPU reset /
  headless churn) left the canvas blank after three.js restored it — both views now repaint on
  `webglcontextrestored`.

### Process
- Branch protection enabled on develop + main (required checks: test, web, guards) after CI
  caught a red merge yesterday.

## [0.10.000] — 2026-07-02

### Added — the geometry & constraints case matrix + docs (#23)
- **Four new cases** (category "geometry & constraints", C08–C11): deep pit with long 8% ramps
  (TRUCK-bound), shallow flat pit (SHOVEL-bound), crusher-limited pit with a BAKED 2.6 kt/h cap,
  and a mixed 793F+930E fleet. Every expected band is ASSERTED in `test/cases23.test.ts`
  (oracle binding sides, per-truck productivity gap, cap band + uncapped twin, both payloads
  landing), not assumed. 12 cases total; registry, docs taxonomy and manifests updated.
- **Field-found fix (C10 test):** gating the crusher cap on delivered tonnage alone was
  bang-bang — the trailing window drained and the WHOLE held fleet released at once,
  overshooting the cap by ~60%. The gate now counts COMMITTED in-flight ore, releasing trucks
  a few at a time: the ceiling is a ceiling (≤ cap band, never overshoot).
- **Constraints UI honesty:** the sidebar chips now show the EFFECTIVE constraint set (baked
  case constraints like C10's cap + the demo toggle, which MERGES instead of overwriting).
- Contract 1 accepts 930E and mixed fleets declared as "A+B" (every component validated).
- docs/: Contract 3 (real-sample lane — cyclelog/v1 rules, provenance with the minehaulsim
  source, topo wiring, registry build) added to the data-contracts page; cases taxonomy at 4
  categories with asserted bands.

## [0.09.000] — 2026-07-02

### Added — the OR tier + operational constraints (#22)
- **Hungarian joint assignment** as a first-class policy (`OR — optimal assignment`): a pure-TS
  O(n³) Kuhn–Munkres solver over truck→shovel-SLOT matrices (slot k prices k extra queue loads,
  completion-time objective) fed by a new additive `DispatchState.fleet` view (the trucks that
  will ask for dispatch within the window + cross-truck ETAs). Field-found fix: the slot price
  must include IN-TRANSIT committed trucks — omitting them re-created herding (test-caught).
  Honest corpus result: hungarian ranks 3rd (mean rank 3.63) behind greedy/shortest-wait —
  instantaneous assignment does not beat the good myopic heuristics here; stated plainly.
- **Operational constraints enforced for EVERY policy** (`sim/constraints.ts`): shovel-truck
  compatibility, per-shovel commitment cap, crusher trailing-hour tph cap, shift breaks. The DES
  filters the FEASIBLE set before the policy sees the state; infeasible returns are re-assigned
  and counted (`SimResult.invalidChoices`). App: constraints toggle + active chips + enforcement
  note (tonnes visibly drop under the demo set).
- **Capacity oracle** (`sim/oracle.ts`): the transportation-relaxation upper bound (exact under
  deterministic dynamics, tested strictly; 2% seed-noise margin documented). Benchmark scores
  every policy as "% of oracle" per case, and each real sample against its EMPIRICAL oracle.
- Methodology: new "OR tier + constraints" tab (assignment MILP, cost equation, constraint
  model, oracle derivation — bilingual, with references).
- Cross-source τ now compares ONLY policies with identical semantics in both sources (hungarian
  runs a solo fallback inside cfsim, so it is excluded from τ and reported separately).
- Bench artifacts regenerated: 8 cases × 8 policies × 20 seeds.

## [0.08.000] — 2026-07-02

### Added — the OFFLINE Benchmark (#19)
- **Benchmark page rebuilt on precomputed artifacts** (`/data/bench/*.json`; the page does zero
  heavy compute): five tabs — Synthetic corpus (8 cases × 7 policies × 20 seeds: p10–p90 bands,
  Pareto marks, statistical-tie verdicts, aggregate mean-rank) · Learned vs classical (held-out
  fidelity + per-case Δ% vs the best heuristic — they imitate, they don't beat, stated plainly) ·
  Match factor (fleet-sweep knee vs MF=1 per multi-shovel case) · Real counterfactual ·
  Cross-source.
- **Calibrated counterfactual re-simulation** (`frontend/src/replay/cfsim.ts`): re-runs each
  REAL shift under every policy with all time components from the sample's own empirical
  distributions (per-shovel load medians, per-route travel, p10 queue-free empty base, cv-0.15
  seeded jitter); per-sample CALIBRATION BIAS reported via the highest-agreement policy —
  cf-vs-cf is the signal, vs-actual carries the stated bias.
- **Cross-source consistency**: Kendall τ between the synthetic aggregate ranking and each real
  shift's counterfactual ranking (median τ 0.71; the nearest-generated shifts reorder queue-aware
  policies — τ 0.05/0.24, reported as the honest finding it is).
- Pipeline generators `bench_synthetic.mjs` + `bench_real.mjs` (Node + tsx over the SAME TS DES
  and ingest the browser runs); artifacts committed under `data/derived/bench/`.

### Fixed
- Footer version now reads `package.json` (was hardcoded, showing a stale 0.05.000).
- ADR-0016 §2 footer completed: data/engine provenance (minehaulsim) + static-site disclaimer.

## [0.07.000] — 2026-07-02

### Added — minehaulsim as the structure-real source (#30)
- **10 new shipped samples** generated with our published simulator
  ([minehaulsim 0.10.0](https://pypi.org/project/minehaulsim/), pinned in `.venv-pipeline`):
  6 structurally varied open pits (small/mid ship minqueue+nearest comparison pairs; deep
  single-lane spiral, dual-ramp one-way circulation, two-crusher, three-phase eccentric) + 2
  underground mines (LHD/ore-pass flow, truck-direct). Every sample gated by the ingest-contract
  validator in the pipeline before shipping.
- **Real pit topography in the 3D view:** samples carry `<id>.topo.json` (the PitTopoSpec of the
  ACTUAL generated geometry — least-squares rim fit, bench count/height, shovel benches);
  `loadSample` attaches it so `Pit 3D` renders the real mine instead of the derived default
  (verified: 16-bench deep spiral vs 7-bench small pit vs the 5-bench default).
- New pipeline generator `dlab/science/minehaulsim_gen/generate.py`; sample registry built with
  minehaulsim entries FIRST (the default sample no longer comes from OpenMines).

### Changed
- **OpenMines demoted to legacy** (kept for cross-tool comparison): generator + provenance
  labelled — single fixed mine, scalar-distance roads, no grades/rimpull, statistical congestion.
- Sample chips: readable labels (`mhs-` stripped, `huolinhe-*` → `openmines-*`).

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
