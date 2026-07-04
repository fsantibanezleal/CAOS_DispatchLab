# 07, Deploy (GitHub Pages, static deterministic-replay)

DispatchLab is static-first (no backend at request time). `.github/workflows/deploy-pages.yml` on push to `main`:

1. installs the **light** Python lane (`requirements.txt` + `-e .`, numpy-only, **no torch, no Node**) and runs
   `python -m dlab.pipeline all` to regenerate the per-case traces + manifests from the committed `case-results.json`;
2. builds the SPA (`cd frontend && npm ci && npm run build`; `copy-data.mjs` overlays `data/derived/` into `public/`);
3. uploads `frontend/dist` and deploys to Pages.

CI does **not** retrain (the committed ONNX/dl-learned/case-results are the offline lane's real outputs; `--retrain`
needs torch + the Node DES dataset gen and is local-only).

## Custom domain

Live at **dispatchlab.fasl-work.com** (custom domain → Vite `base: '/'`; `frontend/public/CNAME` carries it). The
domain is set once on the Pages API via
`gh api PUT repos/fsantibanezleal/CAOS_DispatchLab/pages -f cname=dispatchlab.fasl-work.com` (the CNAME file alone does
not set the domain on Actions deploys). A SPA 404-fallback (`vite.config.ts`) resolves deep links through the router.

## The dormant VPS path

`deploy/{fasl-slug.service, domain.nginx}` are dormant systemd/nginx templates, used only if `app/` is ever activated
(an ADR-0002 trigger). This solution does not require them at the moment.
