// Case-behaviour + rollout controls for the round-2 corpus. The geometry axis is asserted (a DEEP narrow
// pit is truck/haul-bound; a SHALLOW wide pit is shovel-bound), the crusher-cap logic is exercised, the
// mixed fleet lands both payloads, and the beyond-SOTA rollout dispatcher's controls hold (byte-parity with
// the live DES, the deterministic improvement bound, a tie on the symmetric fixture, a strict win on the
// asymmetric fixture, and an exact match to the 1x1 oracle).
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { runSimulation } from '../src/sim/model';
import { RolloutSim } from '../src/sim/rolloutSim';
import { runRollout, DEFAULT_ROLLOUT } from '../src/policies/rollout';
import { capacityOracle } from '../src/sim/oracle';
import { caseById, CASES } from '../src/sim/cases';
import { ORACLE_1x1, TIE_SYM, POS_ASYM } from './fixtures';
import { policyById, shortestWait } from '../src/policies/heuristics';
import { type CaseSpec } from '../src/sim/types';

test('GEOMETRY axis: the deep narrow pit C04 has far lower per-truck productivity than the shallow wide C05', () => {
  // long steep internal ramps (deep pit) cost real cycle time, each truck moves far less per shift than in
  // the short-flat shallow pit, the physical signature of deep vs plane geometry.
  const deep = runSimulation(caseById('C04'), policyById('greedy').fn, 7);
  const shallow = runSimulation(caseById('C05'), policyById('greedy').fn, 7);
  const perTruckDeep = deep.tonnes / caseById('C04').fleet.trucks.length;
  const perTruckShallow = shallow.tonnes / caseById('C05').fleet.trucks.length;
  assert.ok(perTruckDeep < perTruckShallow * 0.7,
    `deep ${perTruckDeep.toFixed(0)} t/truck should be well under shallow ${perTruckShallow.toFixed(0)}`);
});

test('BINDING axis: the corpus exercises BOTH a truck/haul-bound regime AND a shovel-bound regime', () => {
  const sides = new Set(CASES.map((c) => capacityOracle(c).bindingSide));
  assert.ok(sides.has('trucks'), 'no truck/haul-bound case');
  assert.ok(sides.has('shovels'), 'no shovel-bound case');
});

test('crusher cap logic: capping the plant bounds the ORE feed (waste keeps moving to its own dump)', () => {
  const c = caseById('C01');
  const capped: CaseSpec = { ...c, constraints: { crusherMaxTph: 2000 } };
  const r = runSimulation(capped, policyById('greedy').fn, 7);
  const feed = r.crusherFeed[r.crusherFeed.length - 1].tonnes;
  const capBand = 2000 * 8;
  assert.ok(feed <= capBand * 1.25, `${feed} crusher feed should be near the ${capBand} cap band`);
  const free = runSimulation({ ...c, constraints: undefined }, policyById('greedy').fn, 7);
  const freeFeed = free.crusherFeed[free.crusherFeed.length - 1].tonnes;
  assert.ok(freeFeed > feed * 1.1, `uncapped feed ${freeFeed} vs capped ${feed}`);
});

test('mixed fleet (C06): both truck classes complete cycles (payloads 218 and 290 both land)', () => {
  const r = runSimulation(caseById('C06'), policyById('shortestWait').fn, 7);
  const deltas = new Set<number>();
  for (let i = 1; i < r.crusherFeed.length; i++) {
    deltas.add(Math.round(r.crusherFeed[i].tonnes - r.crusherFeed[i - 1].tonnes));
  }
  assert.ok(deltas.has(218) && deltas.has(290), `feed deltas ${[...deltas].join(',')}`);
});

test('every case respects the capacity oracle (deterministic)', () => {
  for (const c of CASES) {
    const bound = capacityOracle(c).tonnes;
    const r = runSimulation(c, policyById('greedy').fn, 7, { deterministic: true });
    assert.ok(r.tonnes <= bound + 1e-6, `${c.id}: ${r.tonnes} exceeds ${bound.toFixed(0)}`);
  }
});

// ---- the forkable rollout model is the SAME physics as the live DES on the whole corpus (byte-parity) ----
test('RolloutSim == model.ts EXACTLY on the deterministic corpus (parity)', () => {
  for (const c of [...CASES, TIE_SYM, POS_ASYM, ORACLE_1x1]) {
    for (const pid of ['greedy', 'shortestWait']) {
      const m = runSimulation(c, policyById(pid).fn, 7, { deterministic: true }).tonnes;
      const o = new RolloutSim(c, 7, { deterministic: true }).runWithPolicy(policyById(pid).fn, c.shiftSec).tonnes;
      assert.equal(o, m, `${c.id}/${pid}: RolloutSim ${o} != model.ts ${m}`);
    }
  }
});

// ---- beyond-SOTA rollout: the deterministic improvement bound (Bertsekas, Tsitsiklis & Wu 1997) ----
const detOpt = { ...DEFAULT_ROLLOUT, base: shortestWait, deterministic: true };
const baseTonnes = (c: CaseSpec) => new RolloutSim(c, 7, { deterministic: true }).runWithPolicy(shortestWait, c.shiftSec).tonnes;

test('rollout is NEVER worse than its base on the deterministic model (policy-improvement bound)', () => {
  for (const c of CASES) {
    const r = runRollout(c, 7, detOpt).tonnes;
    assert.ok(r >= baseTonnes(c) - 1e-6, `${c.id}: rollout ${r} < base ${baseTonnes(c)}`);
  }
});

test('NEGATIVE CONTROL: rollout must TIE the base on the symmetric fixture (a "win" here FAILS the build)', () => {
  const r = runRollout(TIE_SYM, 7, detOpt).tonnes;
  assert.equal(r, baseTonnes(TIE_SYM), `rollout ${r} != base ${baseTonnes(TIE_SYM)} (tie control violated)`);
});

test('the 1x1 oracle fixture: rollout matches the closed-form base EXACTLY (deterministic)', () => {
  const r = runRollout(ORACLE_1x1, 7, detOpt).tonnes;
  const base = baseTonnes(ORACLE_1x1);
  assert.equal(r, base, `rollout ${r} must equal the 1x1 base ${base}`);
  assert.ok(r <= capacityOracle(ORACLE_1x1).tonnes + 1e-6, `${r} exceeds the oracle`);
});

test('POSITIVE control: rollout STRICTLY beats the base on the asymmetric fixture (the look-ahead does real work)', () => {
  const r = runRollout(POS_ASYM, 7, detOpt).tonnes;
  assert.ok(r > baseTonnes(POS_ASYM) + 1, `rollout ${r} should strictly beat base ${baseTonnes(POS_ASYM)}`);
});
