# STRUCTURE — DispatchLab on the CAOS product-repo archetype (ADR-0057)

```
CAOS_DispatchLab/
├─ README.md · CHANGELOG.md (X.XX.XXX) · LICENSE · LICENSES.md · ATTRIBUTION.md · STRUCTURE.md
├─ pyproject.toml (dlab) · .env.example · .gitignore · .gitattributes · .vscode/
├─ requirements.txt (live-thin numpy) · -dev · -precompute (torch/onnx) · -gpu (dormant) · -api (dormant)
├─ data-pipeline/
│  ├─ README.md
│  └─ dlab/                        # the offline engine + staged pipeline
│     ├─ __init__.py (version) · pipeline.py (orchestrator+CLI) · registry.py (cases by CATEGORY) · live.py (dormant)
│     ├─ io/      contract.py (CONTRACT 1: dispatch-scenario schema) · schema.py · formats.py
│     ├─ core/    rng.py · trace.py (CONTRACT 2 trace) · manifest.py (CONTRACT 2) · gate.py (lane gate)
│     ├─ stages/  preprocess · feature_extraction · train · infer · evaluate · export — thin wrappers over science/
│     ├─ cases/   dispatch_cases.py (8 cases: C01-C07 + C12 oracle)
│     └─ science/ gen_dataset.mjs (Node: log DES decisions) · train_policy.py (torch: learned policies -> ONNX) ·
│                 bake_cases.mjs (per-case multi-policy comparison) — preserved verbatim heavy lane (ruff-excluded)
├─ data/
│  ├─ raw/ (git-ignored) · examples/scenarios.csv (passes CONTRACT 1)
│  ├─ derived/  dl-policy.onnx · dl-bcbest.onnx · dl-learned.json · case-results.json
│  │            <case>/trace.json · manifests/<case>.json + index.json   (CONTRACT 2, committed)
│  └─ README.md (the data contract)
├─ frontend/                       # the React/Vite SPA
│  ├─ index.html · package.json · vite.config.ts · tsconfig.json · copy-data.mjs
│  ├─ public/ (CNAME · favicon; the data overlay is git-ignored)
│  ├─ test/sim.test.ts (node --test)
│  └─ src/  pages/ (App/Introduction/Methodology/Implementation/Experiments/Benchmark) · sim/ (the DES) · policies/ ·
│           viz/ · lib/ort.ts (onnxruntime-web) · lib/contract.types.ts (CONTRACT-2 mirror) · data/
├─ app/                            # OPTIONAL FastAPI backend — DORMANT (static-first)
├─ scripts/  setup · precompute · dev · smoke {.sh,.ps1} · check_artifacts.py
├─ deploy/   pages.md (default) · fasl-slug.service · domain.nginx (VPS, dormant)
├─ docs/     README · architecture/ · frameworks/ · cases/ · guides/   (the wiki, ADR-0056)
├─ tests/    test_contract · test_manifest · test_pipeline_smoke · conftest
└─ .github/workflows/  ci.yml (ruff+pytest+pipeline+check_artifacts+guards) · deploy-pages.yml
```

**The base is frozen** — edits land only in the CORE (the DES engine + policies in `frontend/src/`, the training
science in `dlab/science/`, the cases/content), never in the structure, contracts, env, or deploy. The offline lane is
two-language by design: the Node DES dataset generator runs the SAME TS DES the browser does (no re-port). The DES
decision-dataset jsonl is NEVER committed (regenerable).
