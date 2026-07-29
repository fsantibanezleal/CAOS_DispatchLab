# Changelog

## [0.21.001], 2026-07-29

### Changed
- **Bar-chart views fill their panel too.** `BarChart` computed its height as `rows x 30px`, so a
  five-row chart was pinned near 180px inside a full-height panel. It now grows the ROW height to share
  the panel's spare space, clamped between 30 and 64px. Stretching the SVG instead would have distorted
  the bars; taller rows are the honest way to use the height.

Every App view now clears or nearly clears the ADR-0071 50% instrument rule, measured at 1600x900:

| view | before today | now |
|---|---|---|
| Queues / Cycle time / Per-shovel / Decision share / Learned vs heuristic | 32.4% | **50.2%** |
| Compare policies | 16.4% | **58.5%** |
| Crusher feed | 16.5% | **52.2%** |
| MF validation | 15.1% | **50.7%** |
| Pit 3D | 54.1% | 54.1% |
| Pit map | 49.2% | 49.2% |
| Decision inspector | 22.5% | **45.0%** |

Rollout inspector reads 0% and is correct: it computes nothing until you press Compute, which is the
no-compute-bomb rule being honoured, not a missing visualization.

## [0.21.000], 2026-07-29

### Changed (the charts now fill their panels, ADR-0071 rule 6 applied inside the views)
The App's primary instrument already cleared the 50% rule, but the SUB-views did not: measured across
all twelve, most sat at 15-32% of the viewport while the panel around them had room to spare. The cause
was the same magic-number habit as the chrome, one level down.

- **`UPlotChart` can size from its container** (`fill`) instead of taking a hardcoded pixel height.
  A chart pinned to 180-200px inside a full-height panel leaves the rest of the panel empty.
- **`SweepChart` and `ParetoScatter` were capped at their intrinsic width** by `maxWidth: W`, so the SVG
  could not grow into the space available however wide the panel got.
- A single-panel view now stretches to the tab height; multi-panel views keep their natural flow.

Measured before -> after, at 1600x900:

| view | before | after |
|---|---|---|
| Compare policies | 16.4% | **58.5%** |
| Crusher feed | 16.5% | **52.2%** |
| MF validation | 15.1% | **50.7%** |

Pit 3D (54.1%) and Pit map (49.2%) unchanged; the bar-chart views remain at 32.4% and are the next
target.

## [0.20.001], 2026-07-29

### Fixed (ADR-0071 rule 7, which 0.20.000 did not honour)
- **Case and Policy were expanded chip lists, not dropdowns.** Eight case chips and nine policy chips
  spent rail height on lists the user had to read end to end, and the case chips showed only ids
  (`C01`...`C08`) so identifying one meant hovering each. Rule 7 says a categorised one-of-N choice is a
  `select` with `optgroup`. Both are now dropdowns: the case shows `id - name` in one row, and the policy
  is grouped by tier (Heuristics / Optimal / Learned), which also surfaces a distinction the flat chip
  list never showed.
- 0.20.000 applied the ADR-0071 layout rules to this product but skipped rule 7 entirely, so the release
  claimed the floor while violating part of it.

### Verification
- New `tools/visual-verify/_rule7.mjs` gate flags any rail control group of six or more sibling chip
  buttons. Run across all eleven deployed products: **all pass**.

## [0.20.000], 2026-07-28

### Added
- **ADR-0070 scenario focus view** at `/focus/<caseId>`, with a visible **Focus mode** entry at the top of
  the App rail and a return that lands back on the App. Additive: the App keeps every tab and all of its
  explanation. The stage owns 80% of the viewport; the operating state is NAMED on it (Truck-limited /
  Matched fleet / Shovel-limited) with one plain sentence; eight KPIs are overlaid as a HUD instead of
  stacked as cards; the rail carries the Pit-3D/Map toggle, play/reset, a shift-time scrubber, the
  dispatch-policy selector, a basic/advanced toggle, provenance, and scenario chips. Starts PAUSED.

### Changed (ADR-0071 UI floor)
- **Full width.** The App used **75%** of a 1600px viewport because the shell caps pages at a 1200px
  reading measure, which is right for prose and wrong for an instrument. Now 100%.
- **One row of tabs.** Twelve sibling tabs occupied **two rows**, permanently taking vertical space from
  the instrument on every render. Grouped into five (Operation, Throughput, Policies, Decisions,
  Validation); a combined tab carries a caret and reveals its list on hover, chosen from the same tab.
- **The page is the viewport.** Chrome sized by flex instead of a hardcoded constant, and the shell's
  prose footer margin removed: the content-to-footer gap goes **48px -> 0** with no scroll to reach it.
- Layout containment (`min-width: 0` on the tab containers), so a nowrap row cannot size the page wider
  than the screen.
- Shell dependency moved `^0.2.0 -> ^0.3.0` (the newest PUBLISHED version).

### Result, measured at 1280x800 and 1600x900
- viewport width **75% -> 100%**; tab rows **2 -> 1**; content-to-footer gap **48px -> 0**;
  **instrument 23.4% -> 54.1%** of the viewport; no overflow in either axis; zero console errors.
- Verified by driving the pointer, not by requesting URLs: focus opens by CLICK, returns by CLICK, the
  scenario chips produce 3 distinct simulations of 3, and the tab menu survives a pixel-by-pixel pointer
  walk (an automated `.click()` teleports and would pass a menu no hand can use).

## [0.16.000], 2026-07-09
### Changed, domain-correct multi-source corpus rebuild (#67 round 2)
The v0.15 corpus met the letter but not the spirit (too many 1-source / single-destination tiles, dead
stockpiles that sat at 0 %, empty trucks that appeared to vanish). The corpus was rebuilt from scratch to
Felipe's exact design and a domain-correct material-flow model.

- **The corpus is now 8 cases (was 16)**: 3 SIMPLE teaching cases (C01-C03: >= 4 shovels, >= 2 destinations,
  routing + match factor + the two-plant decision) and 5 COMPLEX/DYNAMIC cases (C04-C08: >= 6 shovels scaling
  to 12, an intermediate ore STOCKPILE that is ACTIVELY cycled, multiple plants + waste dumps, plus
  breakdowns / stochastic cycle times / blend windows / shift breaks / phases). C08 is the 12-shovel, 3-phase
  showcase (the default case). All 1-source tiles were removed.
- **Material-flow model**: the only loaded legs are shovel(ore)->crusher, shovel(ore)->stockpile (rehandle),
  shovel(waste)->waste dump; the only empty move is delivery-point -> a SAME-LANE shovel; stockpile->plant is
  the RECLAIMER (a non-truck conveyor). Invalid paths (stockpile->dump, dump->*, plant->*, truck
  stockpile->plant) are never authored and are rejected by a topology test.
- **Pit portal + internal road network**: every pit has a single EXIT/PORTAL; a haul is a polyline
  (shovel -> internal pit roads -> portal -> a direct surface haul -> destination, reversed for the empty
  return). The DES leg time is the sum of the two rimpull segments (`sim/haul.ts`). The portal + internal-road
  layout is authored per pit (deep pit = long steep ramps to a deep portal; plane pit = short flat roads), so
  each case is a visually DISTINCT open-pit section.
- **Active stockpiles**: the crusher is tuned to be the binding bottleneck so ore trucks constantly rehandle
  and the reclaimer draws the pile down. Each stockpile-bearing case fills to >= 30 % of capacity AND draws
  back down in the baked trace (CI-asserted).

### Fixed, the vanishing empty truck (#67 round 2)
- `posOf()` in `sim/model.ts` no longer silently returns `{0,0}` for an unresolved node id; it THROWS (a dev
  guard), so an off-road / origin truck can never ship.
- Empty returns are **material-lane scoped**: an ore hauler returns only to an ore face, a waste hauler only to
  a waste face, so every empty leg runs on a drawn loaded road (its reverse). Single-material cases are
  unaffected (the lane is every shovel), so the tie / oracle / parity anchors stay byte-identical.
- PitMap + Pit3D draw the internal pit roads + the portal + the direct surface hauls, and interpolate each
  truck along its polyline; the empty (blue) truck visibly travels destination -> portal -> shovel on roads.

### Added / changed, engine + tests
- `sim/haul.ts`: one portal-aware `haulTimeSec` used by `model.ts`, `rolloutSim.ts` and the capacity oracle
  (identical physics everywhere). Byte-parity between the live and forkable engines is preserved.
- The axis-coverage gate was extended: a low-source / single-destination / dead-stockpile / off-road /
  invalid-path corpus FAILS the build. The 1x1 oracle + the tie / positive controls moved to test fixtures
  (`frontend/test/fixtures.ts`) so the determinism anchors survive without a 1-source user tile.
- Docs (`docs/cases/01`), Methodology / Introduction / Experiments prose, and the Python case registry updated
  to the new corpus + the material-flow model.
- The learned-policy ONNX (`dl-policy` / `dl-bcbest` / `dl-rollout`) were NOT retrained (the corpus-agnostic
  per-shovel nets still apply); `case-results.json`, the synthetic + rollout benchmarks, traces, manifests and
  the index were regenerated over the new corpus.

## [0.15.000], 2026-07-07
### Note
- C05 was retuned to a 4-shovel, 2-bay plant as part of the realistic corpus, so the rollout's real
  deterministic gain on C05 is now +1.05% (+872 t), not the ~6% of the single-crusher C05 in v0.14.000.
  The Benchmark prose and the code comment were corrected to match the regenerated `bench/rollout.json`.


### Fixed, the synthetic case corpus was a toy (multi-source / multi-destination network) (#67)
Every case used to be shovels -> ONE crusher -> back, with no stockpiles, no waste dumps, no multi-destination
routing, and `DumpSpec.kind` values `'stockpile'`/`'waste'` were dead (never instantiated). The corpus is now
a realistic multi-source, multi-destination dispatch network.

### Added, the engine primitives (identical in `sim/model.ts` and the forkable `sim/rolloutSim.ts`)
- **Multi-destination routing**: ore routes to the nearest crusher, waste to the nearest waste dump, by face
  type; deterministic nearest-by-route assignment when there is more than one valid destination.
- **Multiple crushers / plants** with independent feed KPIs (`SimResult.crusherFeeds`), the aggregate feed KPI
  kept backward-compatible for the single-crusher cases.
- **Crusher receiving BAYS** (a c-server): a 2-bay crusher tips two trucks in parallel; a 1-bay crusher is the
  legacy single-server FIFO (byte-identical).
- **Intermediate STOCKPILES** (`DumpSpec` `areaCapacityT` / `reclaimRateTph` / `rehandleAtQueue` /
  `reclaimTargetId`): ore trucks **rehandle** onto the pile when the crusher is backed up (all bays busy + a
  queue), and a **reclaimer** draws the pile down on a fixed deterministic grid to feed its target crusher.
  A stockpile is a SINK that becomes a SOURCE; its level is baked into `SimResult.stockLevels`.
- Determinism preserved: integer-tick clock, seeded named RNG streams, `(time, priority, seq)` event order.
  The 1x1 oracle (C12), the tie controls (C01/C04), and the positive control (C05) all still hold, and the
  **parity test now includes the stockpile case C13 and the boss C14** (RolloutSim == model.ts byte-for-byte).

### Added, the corpus (16 cases; >= 4 shovels is the FLOOR)
- Redesigned so every non-control case has >= 4 shovels (up to 6), >= 2 destinations where it teaches
  something, and instantiates waste dumps + stockpiles. The only sub-4 cases are the labelled controls
  (C01-C03 MF sweep, C12 1x1 oracle). New **C13** (2-bay crusher + stockpile rehandle + waste dump) and
  **C14 BOSS** (6 shovels, 2 phases, 3 dumps = crusher + waste + stockpile, ore/waste + reclaim + bays, mixed
  793F + 930E fleet). C06 = ore + waste routing; C07 = two crushers; C11/C15/C16 scaled to 4 shovels.
- **Axis-coverage CI gate** (`frontend/test/axisCoverage.test.ts`): asserts every primitive {>=4 shovels,
  multi-dump, waste dump, multiple crushers, stockpile+reclaim, crusher-bays 1&2, mixed fleet} appears in
  >= 1 case, and the >= 4-shovel floor; a toy corpus FAILS the build. No dead `DumpSpec.kind` values.

### Changed
- **Viz**: the Pit map + Pit 3D render typed nodes (crusher = red, waste dump = slate, stockpile = amber with
  a live FILL level that rises on rehandle and falls on reclaim), shovels tinted by face type, reclaim
  conveyors drawn dashed. Paused-by-default (no compute-bomb).
- Re-baked `data/derived` (case-results, traces, manifests, index, synthetic + rollout benchmarks) for the
  16-case corpus. Python mirror (`dlab/cases/dispatch_cases.py`) + docs (`docs/cases/`) updated to the network
  model. The C10 test now gates the crusher FEED (not total tonnes; waste to its own dump is uncapped).

## [0.14.000], 2026-07-07

### Added, the beyond-SOTA Monte-Carlo rollout dispatcher (non-myopia)
- A receding-horizon Monte-Carlo **rollout** dispatcher (`frontend/src/policies/rollout.ts`) over a new
  forkable, closure-free discrete-event engine (`frontend/src/sim/rolloutSim.ts`) that is validated
  byte-for-byte against the live `model.ts` on the deterministic corpus (parity test). At each decision it
  forks the DES, tries each candidate shovel, simulates the horizon under a base heuristic, and picks the
  argmax simulated objective, one policy-improvement step (Bertsekas, Tsitsiklis & Wu 1997,
  DOI 10.1023/A:1009635226865; the stochastic variant, Bertsekas & Castanon 1999, DOI 10.1023/A:1009634810396).
- Two stochastic cases where myopic assignment is genuinely suboptimal: **C15** (Erlang load + lognormal
  travel noise) and **C16** (Poisson shovel breakdown + repair), added to the DES, the oracle, and both the
  TypeScript and Python case corpora (14 cases total).
- **Live**: the rollout is DISTILLED offline into `dl-rollout.onnx` (held-out imitation accuracy ~0.84) and
  runs live via onnxruntime-web like the RWR/BC nets; a new **Rollout inspector** App tab shows the K
  simulated futures per candidate + the chosen action vs the base (on demand, bounded, no autoplay).
- **Benchmark**: a leakage-safe rollout benchmark (`science/rollout_bench.mjs`, disjoint train/eval seed banks,
  Monte-Carlo 95% CIs) writing `data/derived/bench/rollout.json`, surfaced in a new Benchmark "Rollout" tab.
- **Docs**: a Methodology "Look-ahead & rollout" SubTab (Q-factor + the improvement inequality in KaTeX, the
  deterministic-vs-stochastic split, a "why BC, why not yet offline RL" note) and `docs/frameworks/07_rollout/`
  with a theme-aware SVG. New DOI-verified citations (Bertsekas 1997/1999, Seiler 2022, Mining-Gym 2025,
  curriculum-PPO 2025, Zhang 2020, CQL, IQL, two SAGE 2025 DOIs resolved via Crossref).

### Result (measured, honest)
- On the DETERMINISTIC model the improvement bound holds exactly: rollout >= base on every case, with a REAL
  gain only on the asymmetric **C05 (~6% tonnes)** and exact ties on the controls C01/C04/C12.
- Under cycle-time uncertainty the certainty-equivalent rollout does NOT beat myopic assignment (the base is
  already within a few % of the capacity oracle, and the look-ahead edge is fragile to noise). The beyond-SOTA
  WIN condition is NOT met; the honest NULL is shipped alongside the validated deterministic improvement bound.

### Fixed
- `science/train_policy.py` wrote its ONNX + `dl-learned.json` to a stale `data-pipeline/public` path never
  consumed by anything; it now writes the canonical `data/derived` the pipeline + `copy-data.mjs` read.

## [0.13.002], 2026-07-07

### Added
- Deep `docs/cases/` pages (ADR-0056), replacing the single landing table with three numbered pages:
  the 12-case synthetic corpus (config + asserted expected band + validation anchor per case), the
  real-sample lane (the `Synthetic | Real sample` Source selector, the `cyclelog/v1` contract, the
  `minehaulsim` structure-real samples + oreblocks geology, the legacy OpenMines Huolinhe samples, the
  counterfactual re-decision, and the honest structure-real boundary), and the coverage matrix + verdict
  system. At-bar close-out per the 2026-07-07 refresh audit.

### Fixed
- i18n leak: the real-mode counterfactual inspector hint showed a hardcoded Spanish string
  ("argmax de la red") in English mode; it is now bilingual.

## [0.13.001], 2026-07-04

### Changed
- Content standards (ADR-0067): removed every em-dash from tracked content (replaced with commas, or
  "n/a" in table cells). No behaviour change. Added `scripts/check_content_standards.py` + wired it
  into the CI `guards` job so the repo cannot regress on em-dashes or emojis.

## [0.13.000], 2026-07-04

### Added, geology grounding of the structure-real samples (#50, via minehaulsim 0.11 + oreblocks)
- The open-pit mhs-* samples are now geology-grounded: the generator calls `attach_geology`
  (minehaulsim[geology] 0.11.0, backed by the oreblocks package) with a per-family archetype
  (porphyry / vein / layered / core_halo). Each shovel is stamped with the geology of ITS OWN bench
  from the EXACT ultimate pit: bench, grade, ore fraction at the economic cutoff, exposed tonnage.
- Design: geology rides in the sample provenance JSON (scenario metadata), NOT the cyclelog rows,
  so **cyclelog/v1 stays byte-identical** and every existing consumer is unaffected (verified). The
  App joins the face stamp to the per-shovel view by shovel node id.
- App surfaces: the provenance fold shows archetype + economic cutoff + the exact-pit value; the
  Per-shovel tab shows a face chip per shovel (bench · grade · ore fraction). Underground samples
  are left ungeologised (the geology contract is open-pit v1).
- +4 guard tests (geology ingests + is exposed; it is optional/backward-compatible; the committed
  pit samples carry it and ug samples do not; the cyclelog/v1 header is unchanged). Tests + build green.

## [0.12.000], 2026-07-03

### Changed, selection & page UX pass (Felipe's review)
- **Sample/case selection redesigned** (#47): sample FAMILIES as mini-tabs (open-pit /
  underground / openmines) with a dot marking the active sample's family; chips read
  `deep-spiral · minqueue` instead of raw ids; provenance folds into a one-line summary
  (contract flags stay visible); real mode shows one-line facts instead of locked
  grey blocks, the Case grid, constraints chips, policy chips and seed slider are
  synthetic-only.
- **Benchmark made compact + interactive** (#49): the corpus and counterfactual tabs render
  ONE selected case/shift behind chip pickers with a collapsible clickable overview table
  (`.dl-fold`), no more giant scroll (~1.3k px per tab, was 12 stacked bar blocks each).

### Added
- **50× replay speed** (#48), the slow lane for close visual review of queueing, spotting
  and bunching (SPEEDS = [50, 200, 600, 1800]).


## [0.11.000], 2026-07-02

### Added, the striking 3D pass + the underground view (#21)
- **Underground 3D** (`viz/Underground3D.tsx`): the REAL generated mine skeleton from
  `minehaulsim.minetopo/v1`, the decline as a tube along the true polyline, level platforms
  with depth labels, drawpoints, ore-pass tip→chute drops, the shaft bin, and the truck fleet
  animated ALONG THE DECLINE on haul legs (queued/serving trucks at their markers;
  representational mapping stated in the panel). Same on-demand render discipline as Pit3D.
  `loadSample` attaches minetopo to underground samples; the tab renames to "Mine 3D".
- **Pit 3D impact pass:** sprite text labels (S1..Sn on their bench, crusher/dump at the rim,
  theme-aware), depth-cue fog and a subtle rim light.
- **Field-found robustness fix (via the visual verifier):** a lost WebGL context (GPU reset /
  headless churn) left the canvas blank after three.js restored it, both views now repaint on
  `webglcontextrestored`.

### Process
- Branch protection enabled on develop + main (required checks: test, web, guards) after CI
  caught a red merge yesterday.

## [0.10.000], 2026-07-02

### Added, the geometry & constraints case matrix + docs (#23)
- **Four new cases** (category "geometry & constraints", C08–C11): deep pit with long 8% ramps
  (TRUCK-bound), shallow flat pit (SHOVEL-bound), crusher-limited pit with a BAKED 2.6 kt/h cap,
  and a mixed 793F+930E fleet. Every expected band is ASSERTED in `test/cases23.test.ts`
  (oracle binding sides, per-truck productivity gap, cap band + uncapped twin, both payloads
  landing), not assumed. 12 cases total; registry, docs taxonomy and manifests updated.
- **Field-found fix (C10 test):** gating the crusher cap on delivered tonnage alone was
  bang-bang, the trailing window drained and the WHOLE held fleet released at once,
  overshooting the cap by ~60%. The gate now counts COMMITTED in-flight ore, releasing trucks
  a few at a time: the ceiling is a ceiling (≤ cap band, never overshoot).
- **Constraints UI honesty:** the sidebar chips now show the EFFECTIVE constraint set (baked
  case constraints like C10's cap + the demo toggle, which MERGES instead of overwriting).
- Contract 1 accepts 930E and mixed fleets declared as "A+B" (every component validated).
- docs/: Contract 3 (real-sample lane, cyclelog/v1 rules, provenance with the minehaulsim
  source, topo wiring, registry build) added to the data-contracts page; cases taxonomy at 4
  categories with asserted bands.

## [0.09.000], 2026-07-02

### Added, the OR tier + operational constraints (#22)
- **Hungarian joint assignment** as a first-class policy (`OR, optimal assignment`): a pure-TS
  O(n³) Kuhn–Munkres solver over truck→shovel-SLOT matrices (slot k prices k extra queue loads,
  completion-time objective) fed by a new additive `DispatchState.fleet` view (the trucks that
  will ask for dispatch within the window + cross-truck ETAs). Field-found fix: the slot price
  must include IN-TRANSIT committed trucks, omitting them re-created herding (test-caught).
  Honest corpus result: hungarian ranks 3rd (mean rank 3.63) behind greedy/shortest-wait , 
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
  model, oracle derivation, bilingual, with references).
- Cross-source τ now compares ONLY policies with identical semantics in both sources (hungarian
  runs a solo fallback inside cfsim, so it is excluded from τ and reported separately).
- Bench artifacts regenerated: 8 cases × 8 policies × 20 seeds.

## [0.08.000], 2026-07-02

### Added, the OFFLINE Benchmark (#19)
- **Benchmark page rebuilt on precomputed artifacts** (`/data/bench/*.json`; the page does zero
  heavy compute): five tabs, Synthetic corpus (8 cases × 7 policies × 20 seeds: p10–p90 bands,
  Pareto marks, statistical-tie verdicts, aggregate mean-rank) · Learned vs classical (held-out
  fidelity + per-case Δ% vs the best heuristic, they imitate, they don't beat, stated plainly) ·
  Match factor (fleet-sweep knee vs MF=1 per multi-shovel case) · Real counterfactual ·
  Cross-source.
- **Calibrated counterfactual re-simulation** (`frontend/src/replay/cfsim.ts`): re-runs each
  REAL shift under every policy with all time components from the sample's own empirical
  distributions (per-shovel load medians, per-route travel, p10 queue-free empty base, cv-0.15
  seeded jitter); per-sample CALIBRATION BIAS reported via the highest-agreement policy , 
  cf-vs-cf is the signal, vs-actual carries the stated bias.
- **Cross-source consistency**: Kendall τ between the synthetic aggregate ranking and each real
  shift's counterfactual ranking (median τ 0.71; the nearest-generated shifts reorder queue-aware
  policies, τ 0.05/0.24, reported as the honest finding it is).
- Pipeline generators `bench_synthetic.mjs` + `bench_real.mjs` (Node + tsx over the SAME TS DES
  and ingest the browser runs); artifacts committed under `data/derived/bench/`.

### Fixed
- Footer version now reads `package.json` (was hardcoded, showing a stale 0.05.000).
- ADR-0016 §2 footer completed: data/engine provenance (minehaulsim) + static-site disclaimer.

## [0.07.000], 2026-07-02

### Added, minehaulsim as the structure-real source (#30)
- **10 new shipped samples** generated with our published simulator
  ([minehaulsim 0.10.0](https://pypi.org/project/minehaulsim/), pinned in `.venv-pipeline`):
  6 structurally varied open pits (small/mid ship minqueue+nearest comparison pairs; deep
  single-lane spiral, dual-ramp one-way circulation, two-crusher, three-phase eccentric) + 2
  underground mines (LHD/ore-pass flow, truck-direct). Every sample gated by the ingest-contract
  validator in the pipeline before shipping.
- **Real pit topography in the 3D view:** samples carry `<id>.topo.json` (the PitTopoSpec of the
  ACTUAL generated geometry, least-squares rim fit, bench count/height, shovel benches);
  `loadSample` attaches it so `Pit 3D` renders the real mine instead of the derived default
  (verified: 16-bench deep spiral vs 7-bench small pit vs the 5-bench default).
- New pipeline generator `dlab/science/minehaulsim_gen/generate.py`; sample registry built with
  minehaulsim entries FIRST (the default sample no longer comes from OpenMines).

### Changed
- **OpenMines demoted to legacy** (kept for cross-tool comparison): generator + provenance
  labelled, single fixed mine, scalar-distance roads, no grades/rimpull, statistical congestion.
- Sample chips: readable labels (`mhs-` stripped, `huolinhe-*` → `openmines-*`).

## [0.06.000], 2026-07-01

### Added, the REAL-DATA lane (issues #13-#18, #21; epic #20)
- **Pit topography + 3D view (#21):** parametric terraced pit (bench rings, spiral ramp) + a `Pit 3D` tab, the
  fleet moves along real 3D haul paths (bench → ramp → surface) at the playback clock; render-on-demand.
- **cyclelog/v1 client contract + replay engine (#15):** ingest real cycle logs (reject/flag/derive + provenance);
  fold a measured shift into the same SimResult every tab consumes; real dispatcher decisions extracted.
- **Structure-real shift artifacts (#17):** generated with the MIT OpenMines simulator (Huolinhe-desensitized
  config); 2 shifts shipped with honest provenance; gated through the contract.
- **First-level SOURCE selector (#14) + BYOD:** Synthetic | Real sample; sample picker; bring-your-own CSV through
  the same gate; provenance card; SCENARIO knobs lock in real mode (#16); measured cycle-time tab.
- **Counterfactual dispatch (#18):** re-decide the REAL shift under every policy (heuristics + learned) , 
  per-policy agreement at each real decision point + a live-ONNX inspector on the reconstructed states.

### Fixed
- Playback now defaults PAUSED and halts on a hidden tab (no-autoplay/compute rules).
- Empirical match-factor formula (missing /nLoaders); non-monotonic replay crusher feed; node20 .ts test discovery.


All notable changes to CAOS DispatchLab are documented here. Versions follow `X.XX.XXX` (major.minor.patch); the
project stays in `0.x` while the DES is a didactic simulation (pending heavier OR/RL tiers).

## [0.05.000], 2026-06-21

Refactor onto the CAOS product-repo archetype (ADR-0057), the science core is unchanged; the repo is now a real,
contract-bounded, staged offline pipeline + a frontend SPA.

### Changed
- **`tools/dispatch-rl/` → `data-pipeline/dlab/`**, the Node DES dataset generator + the torch policy training
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
- **Two data contracts**: Contract 1 (`io/contract.py`, dispatch-scenario schema + match-factor outlier policy) and
  Contract 2 (`core/manifest.py` `dispatchlab.manifest/v2` + `core/trace.py` `dispatchlab.trace/v1`), with a TS mirror
  (`frontend/src/lib/contract.types.ts`) that fails `tsc` on drift.
- **Cases by category** (`cases/dispatch_cases.py`): the 8-case matrix (single-shovel MF sweep C01-C03; multi-shovel
  C04-C07; the C12 1×1 oracle control).
- The client-side **lane gate**, two venvs + per-lane requirements, cross-platform `scripts/`, `tests/`
  (contract/manifest/smoke), CI (`ci.yml`) + `deploy-pages.yml`, a `docs/` wiki (ADR-0056), a dormant `app/` FastAPI +
  VPS templates, and the root `CHANGELOG.md` + `STRUCTURE.md` + `LICENSES.md` + `ATTRIBUTION.md`.
- Verified running: ruff clean · pytest 8/8 · pipeline 8 cases · CONTRACT 2 OK · deterministic re-run ·
  `tsc + vite build` green · no venv/jsonl/dll leaks.
