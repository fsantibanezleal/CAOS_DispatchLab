# DispatchLab

[![CI](https://img.shields.io/github/actions/workflow/status/fsantibanezleal/CAOS_DispatchLab/ci.yml?branch=main&label=CI)](https://github.com/fsantibanezleal/CAOS_DispatchLab/actions)
[![License](https://img.shields.io/github/license/fsantibanezleal/CAOS_DispatchLab)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/fsantibanezleal/CAOS_DispatchLab?label=version&sort=semver)](https://github.com/fsantibanezleal/CAOS_DispatchLab/tags)
[![Live demo](https://img.shields.io/badge/demo-live-2ea44f)](https://dispatchlab.fasl-work.com)
[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.21518002-blue)](https://doi.org/10.5281/zenodo.21518002)

Technical report (CC-BY-4.0): *"How Much Does Truck-Shovel Dispatch Matter? A Common-Random-Numbers Bench of Six
Policies and a Learned Rollout, on a Deterministic DES"*, concept DOI
[10.5281/zenodo.21518002](https://doi.org/10.5281/zenodo.21518002) (source in
[`manuscripts/dispatch-bench/`](manuscripts/dispatch-bench/)). The honest answer: dispatch matters by a few
percent (best-vs-worst 3.8% mean, up to 11.7%), the OR-optimal Hungarian wins but simple greedy is within 1.4%,
and a Monte-Carlo rollout imitates the best policy at 0.841.

A didactic, in-browser bench that compares **truck-to-shovel dispatch policies** on a deterministic
discrete-event simulation of an open pit, validated against closed-form match-factor theory and a 1×1
capacity oracle.

**Live:** https://dispatchlab.fasl-work.com · part of the [Faena](https://faena.fasl-work.com) mining-analytics hub.

> A policy-comparison **sandbox**, not a production dispatch system (Modular DISPATCH, Wenco, MineStar) and
> not in-plant tracking. The mine is synthetic but physics-grounded; it has never been validated on a real
> mine, because no public ground-truthed cycle-log benchmark exists.

## What it does

Pick a case → pick a dispatch policy → run the simulation live and watch trucks cycle shovel → crusher →
shovel while the KPIs (tonnes, match factor, shovel utilisation, truck wait, crusher feed) update. The
decision panel diagnoses fleet balance (over/under-trucked + a fleet-sizing suggestion) and the bottleneck.

- **Deterministic DES core**, next-event-time-advance, an integer-tick clock and a `(time, priority, seq)`
  event key (bit-deterministic per engine), seedable `xoshiro128**` named streams (common random numbers
  across policies). Validated by a closed-form 1×1 oracle, a determinism test and the match-factor controls.
- **Truck kinematics** from rimpull/grade physics (total resistance = grade + rolling resistance), not a
  constant speed.
- **Dispatch policies**, fixed, greedy (earliest completion), shortest-expected-wait, the two classic
  conflicting criteria (min-truck-wait vs min-shovel-wait), Hungarian joint assignment (the OR tier) and
  two learned imitation policies (RWR + BC-best, ONNX in-browser). Multi-stage LP, blend-MILP and RL are
  backlog, not implemented.
- **Match factor** as the analytical ground truth, the classic homogeneous formula on a representative
  truck (approximate for mixed fleets; the Burt & Caccetta heterogeneous correction is not implemented yet).

## Architecture

Instantiated from the CAOS product-repo archetype (ADR-0057): a heavy **offline engine** + a **frontend SPA**, bound
by two data contracts. See [`STRUCTURE.md`](STRUCTURE.md) and the [`docs/`](docs/README.md) wiki.

```
OFFLINE  data-pipeline/pipeline/ (Node DES + torch)      LIVE  frontend/src/ (browser, TypeScript)
  science/gen_dataset.mjs  log DES decisions            sim/       the deterministic DES engine
  science/train_policy.py  learned policies -> ONNX      policies/  5 heuristics + Hungarian + 2 learned (onnxruntime-web)
  science/bake_cases.mjs   per-case comparison           viz/       PitMap / Pareto / sweep
        │  --retrain regenerates the artifacts
        ▼
  data/derived/  dl-policy.onnx · dl-bcbest.onnx · dl-learned.json · case-results.json  (committed; the DES dataset jsonl stays git-ignored)
        ▼
  pipeline (numpy) → data/derived/<case>/trace.json + manifests/  (CONTRACT 2; copy-data overlays into frontend/public)
```

The default pipeline is **numpy-only** (rebuilds the replay layer from the committed artifacts), so a clone replays
without torch or Node. Heavy work (the Node DES dataset + torch policy training) is the local-only `--retrain`.

## Develop

```bash
./scripts/setup.sh            # venvs + light deps + editable pkg (numpy+ruff+pytest)   [.ps1 on Windows]
./scripts/precompute.sh       # python data-pipeline/run.py all  (rebuild the replay layer, numpy-only)
.venv-pipeline/bin/python -m pytest    # 8 passed     ·     ./scripts/smoke.sh   # CONTRACT 2 OK
./scripts/dev.sh              # cd frontend && npm install && npm run dev (vite + live DES + ONNX)
cd frontend && npm run build  # tsc --noEmit && vite build (+ copy-data overlay + SPA 404.html)

# regenerate the policies (local-only, torch + Node 20+):
./scripts/setup.sh --precompute && ./scripts/precompute.sh all --retrain
```

Stack: Vite + React 19 + TypeScript, uPlot, the shared `@fasl-work/caos-app-shell`. Deployed to GitHub Pages.
Bilingual (EN default + ES), light/dark.

## Honesty

Synthetic but physics-grounded; every run carries its seed; every approximate quantity is labelled
approximate. Policy rankings are case- and seed-specific, the bench reports distributions, never a single
overconfident winner. MIT licensed.
