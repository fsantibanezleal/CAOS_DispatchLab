// #19 P2+P3 — counterfactual benchmark over the REAL sample corpus + cross-source consistency.
// For every shipped cyclelog sample: ingest with the SAME TS rules the app applies, replay the
// measured shift (actual tonnes), rebuild the MEASURED case (empirical distributions), then
// re-run it under every policy x a seed bank -> counterfactual tonnes vs realized (delta % with
// bands) + per-decision agreement with the real dispatcher. Cross-source: does the synthetic
// ranking survive on real samples? (Kendall tau vs the synthetic aggregate; discrepancies are a
// VALID finding, reported, never hidden.)
//   node --import tsx data-pipeline/dlab/science/bench_real.mjs   (cwd: frontend/ for tsx)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestCycleLog, parseCycleCsv } from '../../../frontend/src/replay/ingest.ts';
import { replayCycleLog } from '../../../frontend/src/replay/replayEngine.ts';
import { agreement, reconstructDecisions } from '../../../frontend/src/replay/counterfactual.ts';
import { cfSimulate } from '../../../frontend/src/replay/cfsim.ts';
import { POLICIES } from '../../../frontend/src/policies/heuristics.ts';
import { makeLearnedPolicy } from '../../../frontend/src/policies/learned.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const REAL = resolve(ROOT, 'data', 'examples', 'real');
const DERIVED = resolve(ROOT, 'data', 'derived');
const OUT = resolve(DERIVED, 'bench');
mkdirSync(OUT, { recursive: true });

const learnedDoc = JSON.parse(readFileSync(resolve(DERIVED, 'dl-learned.json'), 'utf-8'));
const ALL = [
  ...POLICIES,
  { id: 'rwr', en: 'Learned — RWR policy', es: 'Aprendida — política RWR', fn: makeLearnedPolicy(learnedDoc.weights.policy), tier: 'learned' },
  { id: 'bcbest', en: 'Learned — BC-best', es: 'Aprendida — BC-best', fn: makeLearnedPolicy(learnedDoc.weights.bcbest), tier: 'learned' },
];
const SEEDS = Array.from({ length: 10 }, (_, i) => 101 + i * 13);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

const provFiles = readdirSync(REAL).filter((f) => f.endsWith('.provenance.json'));
const samples = [];
for (const pf of provFiles) {
  const prov = JSON.parse(readFileSync(resolve(REAL, pf), 'utf-8'));
  const csv = readFileSync(resolve(REAL, `${prov.id}.csv`), 'utf-8');
  const report = ingestCycleLog(parseCycleCsv(csv), {
    id: prov.id, name: prov.name,
    provenance: { source: prov.source, license: prov.license, kind: prov.kind, caveats: prov.caveats },
  });
  if (!report.ok || !report.sample) {
    samples.push({ id: prov.id, ok: false, reasons: report.rejected.map((r) => r.reason) });
    continue;
  }
  const s = report.sample;
  const actual = replayCycleLog(s).result.tonnes;
  const decisions = reconstructDecisions(s);
  const agree = agreement(decisions, ALL, false);
  const policies = ALL.map((p) => {
    const tonnes = SEEDS.map((seed) => cfSimulate(s, p.fn, seed).tonnes);
    const med = median(tonnes);
    const a = agree.find((x) => x.id === p.id);
    return {
      id: p.id, en: p.en, es: p.es,
      cfTonnes: r1(med), loT: r1(Math.min(...tonnes)), hiT: r1(Math.max(...tonnes)),
      deltaPct: r2(((med - actual) / actual) * 100),
      agreePct: a ? r2(a.pct) : null,
    };
  });
  // empirical capacity oracle (#22 P2): same relaxation, from the sample's OWN components
  const loadMeans = Object.values(s.empirical.loadMeanSecByShovel);
  const loadsShovels = loadMeans.reduce((acc, lm) => acc + 1 + s.shiftSec / lm, 0);
  let loadsTrucks = 0;
  for (const _t of s.trucks) {
    let minCycle = Infinity;
    for (const sid of s.shovels) {
      for (const d of s.dumps) {
        const full = s.empirical.fullTravelMedianSec[`${sid}->${d}`];
        if (full == null) continue;
        const empties = Object.entries(s.empirical.emptyTravelMedianSec)
          .filter(([k]) => k.startsWith(`${d}->`)).map(([, v]) => v);
        const empty = empties.length ? Math.min(...empties) : full;
        const cyc = (s.empirical.loadMeanSecByShovel[sid] ?? 150) + full + s.empirical.dumpMeanSec + empty;
        if (cyc < minCycle) minCycle = cyc;
      }
    }
    if (Number.isFinite(minCycle)) loadsTrucks += 1 + s.shiftSec / minCycle;
  }
  const oracleTonnes = Math.min(loadsShovels, loadsTrucks) * s.empirical.payloadMeanT;

  // calibration bias: how far the model lands from the REAL shift when driven by the policy
  // that most resembles the real dispatcher (highest decision agreement). Shown, never hidden:
  // cf-vs-cf comparisons are the signal; vs-actual deltas carry this model bias.
  const byAgree = policies.filter((p) => p.agreePct != null).sort((a, b) => b.agreePct - a.agreePct);
  const calibrationBiasPct = byAgree.length ? byAgree[0].deltaPct : null;
  samples.push({
    id: s.id, name: s.name, ok: true, kind: prov.kind,
    generator: prov.generator?.package ?? (prov.generator?.openmines ? 'openmines' : 'unknown'),
    actualTonnes: r1(actual), realDispatcher: prov.generator?.dispatcher ?? 'unknown',
    nDecisions: decisions.length, nShovels: s.shovels.length, nTrucks: s.trucks.length,
    calibrationBiasPct, mostSimilarPolicy: byAgree.length ? byAgree[0].id : null,
    oracleTonnes: r1(oracleTonnes), actualPctOfOracle: r2((actual / oracleTonnes) * 100),
    policies,
  });
  console.log(`${s.id}: actual ${r1(actual)} t, ${decisions.length} decisions, best cf ${policies.slice().sort((a, b) => b.cfTonnes - a.cfTonnes)[0].id}`);
}

// P3 — cross-source consistency: rankings on real samples vs the synthetic aggregate
const synth = JSON.parse(readFileSync(resolve(OUT, 'synthetic.json'), 'utf-8'));
const synthRank = synth.aggregate.map((a) => a.id);                 // best..worst by mean rank
function kendallTau(a, b) {
  const idx = new Map(b.map((x, i) => [x, i]));
  const xs = a.filter((x) => idx.has(x));
  let concordant = 0, discordant = 0;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    const d = (idx.get(xs[i]) - idx.get(xs[j]));
    if (d < 0) concordant++; else if (d > 0) discordant++;
  }
  const n = (xs.length * (xs.length - 1)) / 2;
  return n ? r2((concordant - discordant) / n) : null;
}
// Cross-source compares ONLY the policies whose semantics are IDENTICAL in both sources: the
// hungarian policy degrades to its solo fallback inside cfsim (no fleet view there), so ranking
// it across sources would compare two different algorithms — it is excluded from tau and
// reported separately per sample (honest apples-to-apples).
const CROSS_IDS = new Set(ALL.filter((p) => p.tier !== 'or').map((p) => p.id));
const cross = samples.filter((s) => s.ok).map((s) => {
  const realRank = s.policies.filter((p) => CROSS_IDS.has(p.id))
    .slice().sort((a, b) => b.cfTonnes - a.cfTonnes).map((p) => p.id);
  return { id: s.id, generator: s.generator, realRank,
           tauVsSynthetic: kendallTau(synthRank.filter((x) => CROSS_IDS.has(x)), realRank) };
});

const doc = {
  schema: 'dispatchlab.bench.real/v1',
  nSeeds: SEEDS.length, seeds: SEEDS,
  caveat: 'Counterfactual tonnes come from cfsim: a re-simulation calibrated to each sample’s EMPIRICAL components (per-shovel load medians, per-route travel medians with p10 queue-free empty base, dump mean, measured payload; cv-0.15 seeded jitter), NOT a re-run of the source generator. Deltas are policy-effect estimates under the measured-case model, with domain-transfer caveats per sample provenance. Agreement is exact (reconstructed decision points).',
  syntheticRanking: synthRank,
  samples, cross,
};
writeFileSync(resolve(OUT, 'real.json'), JSON.stringify(doc));
console.log(`bench real: ${samples.filter((s) => s.ok).length}/${samples.length} samples -> data/derived/bench/real.json`);
console.log('cross-source tau:', cross.map((c) => `${c.id}:${c.tauVsSynthetic}`).join('  '));
