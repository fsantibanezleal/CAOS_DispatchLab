# 02 · The real-sample lane

The App's first-level **Source selector** (`Synthetic | Real sample`) is the Faena workbench requirement: the
same tools that run on the synthetic corpus also run, unchanged, on a **real cycle log**. In Real-sample mode
the scenario knobs are hidden (you do not "design" a real shift, you replay it); you pick which logged shift
to load, and every analysis (per-shovel utilisation, crusher feed, queueing, decision share, cycle time, and
the counterfactual re-decision) runs on it live. This page documents where those samples come from, the
contract they satisfy, and exactly what is and is not real about them.

## The data contract: `dispatchlab.cyclelog/v1`

Every real sample is a CSV that validates against the `dispatchlab.cyclelog/v1` schema (the client-side
ingester is `frontend/src/replay/ingest.ts`; a bring-your-own CSV goes through the same validator, and
rejected files surface an explicit reason). One row is one truck cycle: the shovel it loaded at, the load /
haul / dump / return timestamps, the payload, and the dispatch decision that was taken. That is enough to
replay the shift, recompute every KPI, and re-decide each dispatch point under a different policy. It is
deliberately **not** enough to reconstruct the pit geometry: cycle logs carry no coordinates, so the map
geometry shown in Real mode is schematic, and the App says so in-app.

## Source 1 (default): `minehaulsim` structure-real samples

The default real samples are generated with **minehaulsim** (`pypi.org/project/minehaulsim`, Apache-2.0), a
real published DES package (versions 0.10.0 / 0.11.0) written for this portfolio and used offline in
`data-pipeline/dlab/science/minehaulsim_gen/generate.py`. It simulates open-pit and underground haulage as a
deterministic discrete-event system on a **constrained road network** with rimpull-speed-by-grade, direction
zones and emergent bunching, from a seeded parametric mine generator. Each shipped sample carries a
`*.provenance.json` recording the generator version, the scenario and sim seeds, the dispatcher, and the
scenario description (for example: *16 benches x 10 m, spiral ramp, 6 shovels, 2 dumps, 42 trucks*), plus a
`*.topo.json`, a `*.minespec.json`, and, since v0.13.000, per-shovel geology face stamps.

The geology stamps come from **oreblocks** (via `minehaulsim[geology]` 0.11): each shovel's active face gets a
bench, a grade, an ore fraction and a level tonnage, sampled from a stamped-optimum synthetic block model
(porphyry archetype, an explicit cut-off grade). This is what drives the per-shovel geology chips in the App;
it is generated data with a *known* optimum, never a claim about a specific deposit.

These samples are labelled **structure-real**, and the honest boundary is stated in every provenance file and
in-app (`frontend/src/pages/Tool.tsx`): the road network, grades, speeds and queueing are simulated physics,
but the mine itself is generated, not a real operation, and the equipment curves are class-representative
(793F / 930E / LHD classes), not OEM data. No calibration to any specific mine is claimed.

## Source 2 (legacy, optional): OpenMines Huolinhe samples

Kept for cross-tool comparison (they predate the switch to minehaulsim, issue #30): two shifts generated with
the MIT-licensed **OpenMines** simulator (`github.com/370025263/openmines`, arXiv:2404.00622) from its
`north_pit_mine.json` config, itself desensitised from the **Huolinhe** open-pit coal mine (Sept 2022). These
use a single fixed mine layout with scalar-distance roads, no grades or rimpull, and statistical congestion
only, so they are a coarser structure-real sample than the minehaulsim set and carry a coal-to-copper
domain-transfer caveat. They exist to show that the same ingester and analyses work on a differently-shaped
log from an independent tool.

## What Real mode actually shows

- **Replay** (`frontend/src/replay/replayEngine.ts`): the logged shift is played back tab by tab. The map and
  3D tabs animate the replay (play defaults paused, halts on a hidden tab); the analysis tabs recompute their
  KPIs from the log.
- **Counterfactual** (`frontend/src/replay/counterfactual.ts`, the dedicated `counterfactual` tab): every
  decision point in the real shift is re-decided under each policy (the five heuristics, the OR/Hungarian
  tier, and the two live-ONNX learned policies), reporting an agreement % per decision point. This answers
  "what would each dispatcher have done on this real shift?" without pretending to know the counterfactual
  tonnage, which the log cannot provide.
- Honest framing (in-app): *"MEASURED shift replayed from a cycle log; map geometry schematic (logs carry no
  coordinates); NOT a production dispatch system."*

## The honest boundary: why "structure-real", not "real"

No ground-truthed open-pit fleet-management dispatch log is public (verified 2026-07-01): operators treat FMS
data (Wenco, MineStar, Modular) as confidential. So the highest-integrity data available is *structurally*
real: real DES physics (rimpull, queueing, constrained roads, real equipment classes) over a generated or
desensitised mine. The App never labels these as field data, and the Benchmark cross-source agreement metric
excludes anything that would imply a field ground truth. This is the same honesty gate the whole Faena suite
applies: label the synthetic, never dress it as measured.

## References

- minehaulsim: `pypi.org/project/minehaulsim` (Apache-2.0), used in `data-pipeline/dlab/science/minehaulsim_gen/`.
- oreblocks geology engine: `minehaulsim[geology]` 0.11 (stamped-optimum synthetic block models).
- OpenMines: Chen et al., *OpenMines: A Light and Comprehensive Mining Simulation Environment for Truck
  Dispatching*, arXiv:2404.00622 (MIT); config desensitised from Huolinhe open-pit coal mine.
- Contract + ingestion details: [`../architecture/08_data-contracts.md`](../architecture/08_data-contracts.md);
  the guide [`../guides/`](../guides/) covers bringing your own `cyclelog/v1` CSV.
