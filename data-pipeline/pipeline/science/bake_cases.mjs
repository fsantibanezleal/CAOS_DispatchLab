// Bake the per-case multi-policy comparison through the SAME live TypeScript DES the browser runs, and write
// data/derived/case-results.json, the committed, deterministic per-case outputs the LIGHT Python pipeline reshapes
// into per-case replay traces + manifests (CONTRACT 2). Run after the SPA lives under frontend/:
//   node --import tsx data-pipeline/dlab/science/bake_cases.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparePolicies, paretoFront, tieVerdict } from '../../../frontend/src/sim/compare.ts';
import { CASES } from '../../../frontend/src/sim/cases.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DERIVED = resolve(HERE, '../../../data/derived');
mkdirSync(DERIVED, { recursive: true });

const SEEDS = Array.from({ length: 10 }, (_, i) => 101 + i * 13);   // a deterministic seed set for the p10/p90 bands
const r1 = (x) => Math.round(x * 10) / 10;

const cases = {};
for (const c of CASES) {
  const stats = comparePolicies(c, SEEDS);
  const pareto = paretoFront(stats);
  const tie = tieVerdict(stats);
  cases[c.id] = {
    policies: stats.map((s) => ({ id: s.id, en: s.en, es: s.es, medTonnes: r1(s.medTonnes), medWaitH: r1(s.medWaitH),
      loT: r1(s.loT), hiT: r1(s.hiT), loW: r1(s.loW), hiW: r1(s.hiW), pareto: pareto.has(s.id) })),
    pareto: [...pareto],
    tie,
  };
}
writeFileSync(resolve(DERIVED, 'case-results.json'),
  JSON.stringify({ schema: 'dispatchlab.caseresults/v1', nSeeds: SEEDS.length, n: Object.keys(cases).length, cases }));
console.log(`baked ${Object.keys(cases).length} case results -> data/derived/case-results.json`);
