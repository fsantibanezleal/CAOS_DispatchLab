# Third-party licenses

DispatchLab depends on the following open-source components. Each retains its own license.

## Offline lane (Python — `requirements*.txt`)

| Package | License |
|---|---|
| numpy | BSD-3-Clause |
| torch (PyTorch) | BSD-3-Clause (+ third-party notices) |
| onnx | Apache-2.0 |
| onnxruntime | MIT |
| ruff | MIT |
| pytest | MIT |

The offline DES dataset generator + the case bake run on **Node.js** (the SAME TypeScript DES the browser uses, via `tsx`).

## Frontend (npm — `frontend/package.json`)

| Package | License |
|---|---|
| react / react-dom | MIT |
| react-router-dom | MIT |
| onnxruntime-web | MIT |
| uplot | MIT |
| katex | MIT |
| lucide-react | ISC |
| zustand | MIT |
| vite / @vitejs/plugin-react | MIT |
| typescript | Apache-2.0 |
| @fasl-work/caos-app-shell | © Felipe Santibáñez-Leal (CAOS shared shell) |

Versions are pinned in `requirements*.txt` and `frontend/package-lock.json`.
