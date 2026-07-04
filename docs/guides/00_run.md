# 00, Run DispatchLab

A clone replays with **no torch and no Node DES gen**, the trained ONNX + dl-learned.json + the engine
`case-results.json` are committed under `data/derived/`.

```bash
# 1) venvs + light deps + editable package (instant, numpy + ruff + pytest)
./scripts/setup.sh            #  (PowerShell:  ./scripts/setup.ps1)

# 2) rebuild the per-case replay traces + manifests from the committed artifacts (numpy-only)
./scripts/precompute.sh       #  -> python -m dlab.pipeline all

# 3) tests + the Contract-2 disk check
.venv-pipeline/bin/python -m pytest        # 8 passed
./scripts/smoke.sh                         # CONTRACT 2 OK

# 4) the SPA (copy-data overlays data/derived; live TS DES + ONNX)
./scripts/dev.sh              #  -> cd frontend && npm install && npm run dev
```

Build for production: `cd frontend && npm run build` (runs `copy-data.mjs` then `tsc --noEmit && vite build`).
