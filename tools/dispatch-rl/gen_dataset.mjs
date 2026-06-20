// Dataset generator for the learned dispatch policy. Rather than re-port the discrete-event simulator to
// Python (divergence risk), we GENERATE the training data by running the real TS DES (via tsx) and logging,
// at each dispatch decision, the per-shovel feature matrix + the action the reference policy took + the
// episode's final tonnes. A Python script then trains an imitation/offline-RL policy on this and exports
// ONNX, which the app runs live (onnxruntime-web) at each decision. The state encoding here is the single
// source of truth — the app rebuilds the same per-shovel features before inference.
//
// Run:  node --import tsx tools/dispatch-rl/gen_dataset.mjs
import { writeFileSync } from 'node:fs';
import { runSimulation } from '../../src/sim/model.ts';
import { POLICIES } from '../../src/policies/heuristics.ts';
import { CASES } from '../../src/sim/cases.ts';

// multi-shovel cases only (a single-shovel decision is trivial — nothing to learn)
const MULTI = CASES.filter((c) => c.mine.shovels.length >= 2);
const SEEDS = Array.from({ length: 12 }, (_, i) => 3 + i * 5);
const REF = POLICIES.filter((p) => p.id !== 'fixed');   // log the reactive reference policies

/** Per-shovel feature row from the decision state (the app must reproduce this exactly). */
function feats(state) {
  return state.shovels.map((v) => {
    const travel = state.travelEmptySec(v.id);
    const backlog = v.queueLen + v.inbound + (v.loading ? 1 : 0);
    return [v.queueLen, v.inbound, v.loading ? 1 : 0, v.freeInSec / 300, backlog * v.loadMeanSec / 300, travel / 300];
  });
}

const rows = [];
let decisions = 0;
for (const c of MULTI) {
  const nSh = c.mine.shovels.length;
  for (const seed of SEEDS) {
    for (const p of REF) {
      const ep = [];
      const r = runSimulation(c, p.fn, seed, {
        onDecision: (state, chosen) => {
          const idx = state.shovels.findIndex((v) => v.id === chosen);
          ep.push({ shovels: feats(state), chosen: idx < 0 ? 0 : idx });
        },
      });
      const norm = r.tonnes / (nSh * 9000);   // rough per-shovel tonnes normaliser → episode quality in [0,~1]
      for (const d of ep) rows.push({ ...d, tonnes: +norm.toFixed(4), case: c.id, policy: p.id, nSh });
      decisions += ep.length;
    }
  }
}

writeFileSync(new URL('./dataset.jsonl', import.meta.url), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const byN = {};
for (const r of rows) byN[r.nSh] = (byN[r.nSh] || 0) + 1;
console.log(`wrote dataset.jsonl: ${rows.length} decisions from ${MULTI.length} cases × ${SEEDS.length} seeds × ${REF.length} policies`);
console.log('decisions by #shovels:', JSON.stringify(byN));
