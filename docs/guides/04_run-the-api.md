# 04, The `app/` backend (dormant)

DispatchLab is static deterministic-replay: the SPA + the committed artifacts serve from GitHub Pages with **no
backend at request time** (the DES + the ONNX run entirely in the browser). The `app/` FastAPI module ships dormant
(it compiles; `requirements-api.txt` is commented out) and this solution does not require it.

Activate only on an ADR-0002 trigger (server-side processing of uploaded pit configs, auth-gated private data, or paid
heavy compute). Then: fill `requirements-api.txt`, implement the routes over `data-pipeline/pipeline` (import it, never
re-implement), enable the `deploy/` VPS templates, and add CORS/COOP-COEP headers. See `app/README.md`.
