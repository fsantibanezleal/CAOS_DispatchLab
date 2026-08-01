// #19 P1, the OFFLINE synthetic-corpus benchmark: every policy (5 heuristics + 2 learned via the
// synchronous TS forward) x every case x a 20-seed bank, through the SAME live TS DES the browser
// runs. Writes data/derived/bench/synthetic.json, the Benchmark page only READS it (no heavy
// compute in the browser). Deterministic: fixed seed banks, byte-stable re-runs.
//   node --import tsx data-pipeline/pipeline/science/bench_synthetic.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparePolicies, paretoFront, tieVerdict } from '../../../frontend/src/sim/compare.ts';
import { fleetSweep, kneeIndex, nAtMf1 } from '../../../frontend/src/sim/sweep.ts';
import { capacityOracle } from '../../../frontend/src/sim/oracle.ts';
import { CASES } from '../../../frontend/src/sim/cases.ts';
import { POLICIES, policyById } from '../../../frontend/src/policies/heuristics.ts';
import { makeLearnedPolicy } from '../../../frontend/src/policies/learned.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DERIVED = resolve(HERE, '../../../data/derived');
const OUT = resolve(DERIVED, 'bench');
mkdirSync(OUT, { recursive: true });

// the two learned policies from the committed weights (same forward the live DES uses)
const learnedDoc = JSON.parse(readFileSync(resolve(DERIVED, 'dl-learned.json'), 'utf-8'));
const LEARNED = [
  { id: 'rwr', en: 'Learned, RWR policy', es: 'Aprendida, política RWR', fn: makeLearnedPolicy(learnedDoc.weights.policy), tier: 'learned' },
  { id: 'bcbest', en: 'Learned, BC-best', es: 'Aprendida, BC-best', fn: makeLearnedPolicy(learnedDoc.weights.bcbest), tier: 'learned' },
];
// the DISTILLED rollout policy (beyond-SOTA tier): the fast live net that imitates the Monte-Carlo rollout
// dispatcher. Its TRUE offline numbers (+ the deterministic improvement bound) live in bench/rollout.json;
// here it appears alongside the other live policies so the synthetic benchmark ranks it on the same engine.
if (learnedDoc.weights.rollout) LEARNED.push({ id: 'rollout', en: 'Rollout (distilled)', es: 'Rollout (destilada)', fn: makeLearnedPolicy(learnedDoc.weights.rollout), tier: 'rollout' });
const ALL = [...POLICIES, ...LEARNED];

const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i * 13);   // 2x the case-results bank
const SWEEP_SEEDS = [3, 11, 19, 29, 41];
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

const cases = {};
const rankAccum = {};                                // policy -> [rank per case] (1 = best tonnes)
for (const c of CASES) {
  const stats = comparePolicies(c, SEEDS, ALL);
  const pareto = paretoFront(stats);
  const tie = tieVerdict(stats);
  const byTonnes = [...stats].sort((a, b) => b.medTonnes - a.medTonnes);
  byTonnes.forEach((s, i) => { (rankAccum[s.id] ??= []).push(i + 1); });

  // learned-vs-classical: delta of each learned policy vs the best CLASSICAL median
  const bestClassical = [...stats].filter((s) => POLICIES.some((p) => p.id === s.id))
    .sort((a, b) => b.medTonnes - a.medTonnes)[0];
  const learnedVs = LEARNED.map((lp) => {
    const s = stats.find((x) => x.id === lp.id);
    return { id: lp.id, deltaPct: r2(((s.medTonnes - bestClassical.medTonnes) / bestClassical.medTonnes) * 100) };
  });

  // match-factor validation at scale: the fleet-sweep knee should land at MF≈1 (multi-shovel cases)
  let sweepCheck = null;
  if (c.mine.shovels.length >= 2) {
    const sweep = fleetSweep(c, policyById('greedy').fn, c.mine.shovels.length >= 3 ? 24 : 14, SWEEP_SEEDS);
    const knee = kneeIndex(sweep);
    const mf1 = nAtMf1(sweep);
    sweepCheck = { kneeN: sweep[knee]?.n ?? null, mf1N: mf1, agree: mf1 != null && sweep[knee] != null && Math.abs(sweep[knee].n - mf1) <= 2 };
  }

  // capacity oracle (#22 P2): the queue-free upper bound every policy is scored against
  const oracle = capacityOracle(c);
  cases[c.id] = {
    name: c.name,
    oracle: { tonnes: r1(oracle.tonnes), bindingSide: oracle.bindingSide },
    policies: stats.map((s) => ({
      id: s.id, en: s.en, es: s.es,
      medTonnes: r1(s.medTonnes), medWaitH: r2(s.medWaitH),
      loT: r1(s.loT), hiT: r1(s.hiT), loW: r2(s.loW), hiW: r2(s.hiW),
      pareto: pareto.has(s.id),
      pctOfOracle: r2((s.medTonnes / oracle.tonnes) * 100),
    })),
    tie, learnedVsBestClassical: learnedVs, sweepCheck,
  };
}

// cross-case aggregate: mean rank by median tonnes (1 = best), + the honest verdict inputs
const aggregate = Object.entries(rankAccum)
  .map(([id, ranks]) => ({ id, meanRank: r2(ranks.reduce((a, b) => a + b, 0) / ranks.length), nCases: ranks.length }))
  .sort((a, b) => a.meanRank - b.meanRank);

const doc = {
  schema: 'dispatchlab.bench.synthetic/v1',
  nSeeds: SEEDS.length, seeds: SEEDS, sweepSeeds: SWEEP_SEEDS,
  nPolicies: ALL.length, nCases: CASES.length,
  learnedMeta: {
    policyImitAcc: learnedDoc.policyImitAcc, bcBestImitAcc: learnedDoc.bcBestImitAcc,
    bcBestSelfAcc: learnedDoc.bcBestSelfAcc, bestPolicy: learnedDoc.bestPolicy,
    nTrain: learnedDoc.nTrain, nEval: learnedDoc.nEval,
  },
  aggregate, cases,
};
writeFileSync(resolve(OUT, 'synthetic.json'), JSON.stringify(doc));
console.log(`bench synthetic: ${CASES.length} cases x ${ALL.length} policies x ${SEEDS.length} seeds -> data/derived/bench/synthetic.json`);
console.log('aggregate mean-rank:', aggregate.map((a) => `${a.id}:${a.meanRank}`).join('  '));
