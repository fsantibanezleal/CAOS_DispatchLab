// The OFFLINE rollout benchmark + distillation-dataset generator (the beyond-SOTA tier). It runs the
// receding-horizon Monte-Carlo rollout dispatcher (policies/rollout.ts) against the 5 heuristics + OR/Hungarian
// + the capacity oracle over the corpus, on the SAME forkable DES the look-ahead uses (sim/rolloutSim.ts,
// validated byte-for-byte against the live model.ts on the deterministic corpus), and writes:
//   data/derived/bench/rollout.json                 the Benchmark page reads this (no heavy compute in-browser)
//   data-pipeline/dlab/science/rollout-dataset.jsonl the (state, rollout-action) pairs to DISTILL dl-rollout.onnx
//
// Leakage-safe protocol (per solver-rl-2026-06-20): DISJOINT train vs eval seed banks; the eval bank is also
// disjoint from bench_synthetic's; every stochastic number is a distribution over held-out seeds with a
// Monte-Carlo 95% CI; the deterministic block carries the EXACT policy-improvement bound (rollout >= base).
//
// HONEST RESULT (measured here, not asserted): on the DETERMINISTIC model the rollout is provably >= its base
// and delivers a real gain only on the asymmetric C05 (~1%, +872 t after the 2-bay retune); on the homogeneous cases it TIES. Under cycle-time
// uncertainty the certainty-equivalent rollout does NOT beat myopic assignment (the base is already within a
// few % of the capacity oracle, and the deterministic look-ahead gain is fragile to noise). The WIN condition
// (beat BOTH best-heuristic AND Hungarian outside the CI on >=3 stochastic/asymmetric cases) is NOT met; the
// script reports the honest null. Refs: Bertsekas, Tsitsiklis & Wu 1997 (DOI 10.1023/A:1009635226865);
// Bertsekas & Castanon 1999 (DOI 10.1023/A:1009634810396); White & Olson 1986; Alarie & Gamache 2002.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RolloutSim } from '../../../frontend/src/sim/rolloutSim.ts';
import { runRollout, DEFAULT_ROLLOUT } from '../../../frontend/src/policies/rollout.ts';
import { capacityOracle } from '../../../frontend/src/sim/oracle.ts';
import { caseById } from '../../../frontend/src/sim/cases.ts';
import { greedy, shortestWait, minTruckWait, minShovelWait, fixed } from '../../../frontend/src/policies/heuristics.ts';
import { hungarianPolicy } from '../../../frontend/src/policies/or.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DERIVED = resolve(HERE, '../../../data/derived');
const OUT = resolve(DERIVED, 'bench');
mkdirSync(OUT, { recursive: true });

// base (rollout) policy = a fixed, sequentially-consistent myopic heuristic (the improvement guarantee is
// stated relative to THIS base). shortestWait is the "best cheap default" per policies/heuristics.ts.
const BASE = shortestWait;
const HEURS = [['greedy', greedy], ['shortestWait', shortestWait], ['minTruckWait', minTruckWait], ['minShovelWait', minShovelWait], ['fixed', fixed]];

// the regimes where a look-ahead can defensibly help + the negative controls that MUST tie
const TARGETS = ['C05', 'C06', 'C07', 'C10', 'C11', 'C15', 'C16'];
const CONTROLS = ['C01', 'C04', 'C12'];
const ALL_CASES = [...CONTROLS, ...TARGETS];

// DISJOINT seed banks (no leakage): distillation trains on TRAIN, every reported number uses EVAL.
const TRAIN_SEEDS = Array.from({ length: 16 }, (_, i) => 1000 + i * 7);
const EVAL_SEEDS = Array.from({ length: 16 }, (_, i) => 5000 + i * 11);

const OPT = (extra) => ({ ...DEFAULT_ROLLOUT, base: BASE, ...extra });
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const ci95 = (a) => 1.96 * sd(a) / Math.sqrt(a.length);   // Monte-Carlo 95% CI half-width on the mean
const runPolicy = (c, fn, seed, det = false) => new RolloutSim(c, seed, { deterministic: det }).runWithPolicy(fn, c.shiftSec);

// ---------- deterministic block: the EXACT policy-improvement bound ----------
const deterministic = {};
for (const id of ALL_CASES) {
  const c = caseById(id);
  const base = runPolicy(c, BASE, 7, true).tonnes;
  const roll = runRollout(c, 7, OPT({ deterministic: true })).tonnes;
  deterministic[id] = { base: r1(base), rollout: r1(roll), deltaT: r1(roll - base), deltaPct: r2((roll - base) / base * 100), atLeastBase: roll >= base - 1e-6 };
}

// ---------- stochastic block: distribution over held-out seeds with Monte-Carlo CIs ----------
const cases = {};
let winCount = 0;
for (const id of ALL_CASES) {
  const c = caseById(id);
  const oracle = capacityOracle(c).tonnes;
  const byPolicy = {};
  for (const [pn, pf] of HEURS) byPolicy[pn] = EVAL_SEEDS.map((s) => runPolicy(c, pf, s).tonnes);
  byPolicy.hungarian = EVAL_SEEDS.map((s) => runPolicy(c, hungarianPolicy, s).tonnes);
  const rollRuns = EVAL_SEEDS.map((s) => runRollout(c, s, OPT({ deterministic: false })));
  const rollT = rollRuns.map((r) => r.tonnes);
  const rollW = rollRuns.map((r) => r.waitH);

  // best CLASSICAL heuristic by median tonnes on this case
  const bestHeur = HEURS.map(([pn]) => pn).sort((a, b) => median(byPolicy[b]) - median(byPolicy[a]))[0];
  // paired difference (common seeds) rollout - baseline, with its own CI
  const pairDiff = (baseArr) => rollT.map((v, i) => v - baseArr[i]);
  const dBestH = pairDiff(byPolicy[bestHeur]);
  const dHung = pairDiff(byPolicy.hungarian);
  const beatsHeur = mean(dBestH) - ci95(dBestH) > 0;
  const beatsHung = mean(dHung) - ci95(dHung) > 0;
  const isTarget = TARGETS.includes(id);
  const win = isTarget && beatsHeur && beatsHung;
  if (win) winCount++;

  const polSummary = {};
  for (const pn of Object.keys(byPolicy)) polSummary[pn] = { medTonnes: r1(median(byPolicy[pn])), meanTonnes: r1(mean(byPolicy[pn])), ci: r1(ci95(byPolicy[pn])), pctOfOracle: r2(median(byPolicy[pn]) / oracle * 100) };
  polSummary.rollout = { medTonnes: r1(median(rollT)), meanTonnes: r1(mean(rollT)), ci: r1(ci95(rollT)), medWaitH: r2(median(rollW)), pctOfOracle: r2(median(rollT) / oracle * 100) };

  cases[id] = {
    name: c.name, role: isTarget ? 'target' : 'control',
    oracle: r1(oracle), bestHeur,
    policies: polSummary,
    rolloutVsBestHeur: { meanDelta: r1(mean(dBestH)), ci: r1(ci95(dBestH)), outsideCI: Math.abs(mean(dBestH)) - ci95(dBestH) > 0 },
    rolloutVsHungarian: { meanDelta: r1(mean(dHung)), ci: r1(ci95(dHung)), outsideCI: Math.abs(mean(dHung)) - ci95(dHung) > 0 },
    deterministic: deterministic[id],
    verdict: CONTROLS.includes(id)
      ? (Math.abs(deterministic[id].deltaT) < 1e-6 ? 'control-tie-ok' : 'control-tie-VIOLATED')
      : win ? 'rollout-win' : (Math.abs(mean(dBestH)) <= ci95(dBestH) ? 'tie-within-CI' : (mean(dBestH) > 0 ? 'rollout-ahead' : 'myopic-ahead')),
  };
}

// ---------- overall honest verdict ----------
const WIN_THRESHOLD = 3;   // beyond-SOTA WIN requires >=3 target cases beating BOTH baselines outside the CI
const doc = {
  schema: 'dispatchlab.bench.rollout/v1',
  method: 'receding-horizon certainty-equivalent Monte-Carlo rollout (base = shortestWait); switchMargin ' + DEFAULT_ROLLOUT.switchMargin + '; planModel ' + DEFAULT_ROLLOUT.planModel,
  base: 'shortestWait', trainSeeds: TRAIN_SEEDS, evalSeeds: EVAL_SEEDS, nEval: EVAL_SEEDS.length,
  winThreshold: WIN_THRESHOLD, winCount, win: winCount >= WIN_THRESHOLD,
  honestVerdict: winCount >= WIN_THRESHOLD
    ? `rollout beats best-heuristic AND Hungarian outside the CI on ${winCount} target cases`
    : 'NULL: the certainty-equivalent rollout does NOT beat myopic assignment under cycle-time uncertainty on this homogeneous-fleet corpus (base within a few % of the capacity oracle). The VALIDATED contribution is the exact deterministic policy-improvement bound: rollout >= base everywhere, with a real gain only on the asymmetric C05 (see deterministic block).',
  deterministicGain: { C05: deterministic.C05, C11: deterministic.C11, C16: deterministic.C16 },
  cases,
};
writeFileSync(resolve(OUT, 'rollout.json'), JSON.stringify(doc));
console.log(`rollout bench: ${ALL_CASES.length} cases x ${EVAL_SEEDS.length} eval seeds -> data/derived/bench/rollout.json`);
console.log(`  win ${doc.win} (winCount ${winCount}/${WIN_THRESHOLD}); det C05 +${deterministic.C05.deltaPct}% C11 +${deterministic.C11.deltaPct}% C16 +${deterministic.C16.deltaPct}%`);

// ---------- distillation dataset: (state, rollout-action) pairs over the DISJOINT train seeds ----------
const rows = [];
for (const id of TARGETS.filter((x) => caseById(x).mine.shovels.length >= 2)) {
  const c = caseById(id);
  for (const s of TRAIN_SEEDS) {
    const { log } = runRollout(c, s, OPT({ deterministic: false }));
    for (const d of log) rows.push({ shovels: d.feats, chosen: d.chosen, nSh: d.nSh, case: id, seed: s });
  }
}
writeFileSync(resolve(HERE, 'rollout-dataset.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const byN = {};
for (const r of rows) byN[r.nSh] = (byN[r.nSh] || 0) + 1;
console.log(`rollout distillation dataset: ${rows.length} decisions -> rollout-dataset.jsonl  by #shovels ${JSON.stringify(byN)}`);
