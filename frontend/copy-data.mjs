// Prebuild overlay: copy the committed CONTRACT-2 artifacts (../data/derived) into the SPA's public/ so the static
// site serves them. Canonical copies live in ../data/derived, public/ is a build-time overlay (git-ignored). The
// served paths match what frontend/src/lib/ort.ts + policies/learnedRegistry.ts fetch (root: /dl-policy.onnx,
// /dl-bcbest.onnx, /dl-learned.json); manifests + per-case traces + case-results go under /data/.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DERIVED = join(ROOT, 'data', 'derived');
const PUB = join(HERE, 'public');

if (!existsSync(DERIVED)) {
  console.warn('[copy-data] no data/derived, run scripts/precompute first');
  process.exit(0);
}
mkdirSync(PUB, { recursive: true });

// 1) the live-lane artifacts the SPA fetches from the site root (the learned-policy ONNX + the metrics)
for (const f of ['dl-policy.onnx', 'dl-bcbest.onnx', 'dl-learned.json']) {
  const from = join(DERIVED, f);
  if (existsSync(from)) copyFileSync(from, join(PUB, f));
  else console.warn(`[copy-data] missing ${f}, run scripts/precompute (or --retrain)`);
}

// 2) the CONTRACT-2 manifests + per-case traces + case-results -> public/data (the index loader reads /data/manifests/index.json)
mkdirSync(join(PUB, 'data'), { recursive: true });
cpSync(DERIVED, join(PUB, 'data'), { recursive: true });

// 3) the REAL cycle-log samples (data/examples/real: cyclelog/v1 CSV + provenance + optional
//    per-sample topo.json = the PitTopoSpec of the REAL generated geometry) -> public/data/real
//    + an index. minehaulsim (mhs-*) samples list FIRST so the app's default sample comes from
//    our own simulator, never the legacy OpenMines generator (#30).
const REAL = join(ROOT, 'data', 'examples', 'real');
if (existsSync(REAL)) {
  const dst = join(PUB, 'data', 'real');
  mkdirSync(dst, { recursive: true });
  cpSync(REAL, dst, { recursive: true });
  const samples = readdirSync(REAL).filter((f) => f.endsWith('.provenance.json')).map((f) => {
    const p = JSON.parse(readFileSync(join(REAL, f), 'utf-8'));
    const entry = { id: p.id, name: p.name, kind: p.kind, csv: `${p.id}.csv` };
    if (existsSync(join(REAL, `${p.id}.topo.json`))) entry.topo = `${p.id}.topo.json`;
    return entry;
  });
  samples.sort((a, b) => Number(b.id.startsWith('mhs-')) - Number(a.id.startsWith('mhs-')) || a.id.localeCompare(b.id));
  writeFileSync(join(dst, 'index.json'), JSON.stringify({ samples }, null, 1));
  console.log(`[copy-data] ${samples.length} real cycle-log sample(s) -> public/data/real`);
}
console.log('[copy-data] data/derived -> public/ (root onnx+metrics + /data manifests+traces+case-results) OK');
