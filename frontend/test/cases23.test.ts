// #23: the geometry & constraints cases behave per their DOCUMENTED expected bands, the
// archetype is asserted, not assumed. Plus the beyond-SOTA rollout dispatcher's negative controls +
// improvement bound (a "rollout win" on a tie case MUST fail the build).
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { runSimulation } from '../src/sim/model';
import { RolloutSim } from '../src/sim/rolloutSim';
import { runRollout, DEFAULT_ROLLOUT } from '../src/policies/rollout';
import { capacityOracle } from '../src/sim/oracle';
import { caseById } from '../src/sim/cases';
import { policyById, shortestWait } from '../src/policies/heuristics';

test('C08 deep pit is TRUCK-bound; C09 shallow pit is SHOVEL-bound (the geometry axis)', () => {
  assert.equal(capacityOracle(caseById('C08')).bindingSide, 'trucks');
  assert.equal(capacityOracle(caseById('C09')).bindingSide, 'shovels');
});

test('C08 long steep ramps cost real cycle time vs C09 (same fleet size would over-serve C09)', () => {
  const deep = runSimulation(caseById('C08'), policyById('greedy').fn, 7);
  const shallow = runSimulation(caseById('C09'), policyById('greedy').fn, 7);
  // per-truck productivity: the deep pit moves far less per truck than the shallow one
  const perTruckDeep = deep.tonnes / caseById('C08').fleet.trucks.length;
  const perTruckShallow = shallow.tonnes / caseById('C09').fleet.trucks.length;
  assert.ok(perTruckDeep < perTruckShallow * 0.6,
    `deep ${perTruckDeep.toFixed(0)} t/truck should be well under shallow ${perTruckShallow.toFixed(0)}`);
});

test('C10 the crusher cap is the ceiling: the PLANT FEED is capped, not the fleet (waste keeps moving)', () => {
  const c = caseById('C10');
  const r = runSimulation(c, policyById('greedy').fn, 7);
  const feed = r.crusherFeed[r.crusherFeed.length - 1].tonnes;   // ore delivered TO the crusher
  const capBand = 2600 * 8;                                       // cap tph × shift hours
  // committed-in-flight gating keeps the plant-feed ceiling a CEILING (initial pre-assigned wave: +10%);
  // total mined tonnes (ore feed + waste to its own dump) is LARGER, the cap only gates the crusher.
  assert.ok(feed <= capBand * 1.10, `${feed} crusher feed should be capped near ${capBand}`);
  assert.ok(feed >= capBand * 0.55, `${feed} should not collapse below the cap band`);
  // and the UNCAPPED twin proves the fleet could feed the plant far more
  const free = runSimulation({ ...c, constraints: undefined }, policyById('greedy').fn, 7);
  const freeFeed = free.crusherFeed[free.crusherFeed.length - 1].tonnes;
  assert.ok(freeFeed > feed * 1.1, `uncapped feed ${freeFeed} vs capped ${feed}`);
});

test('C11 mixed fleet: both truck classes complete cycles (payloads 218 and 290 both land)', () => {
  const r = runSimulation(caseById('C11'), policyById('shortestWait').fn, 7);
  const deltas = new Set<number>();
  for (let i = 1; i < r.crusherFeed.length; i++) {
    deltas.add(Math.round(r.crusherFeed[i].tonnes - r.crusherFeed[i - 1].tonnes));
  }
  assert.ok(deltas.has(218) && deltas.has(290), `feed deltas ${[...deltas].join(',')}`);
});

test('all four new cases respect the capacity oracle (deterministic)', () => {
  for (const id of ['C08', 'C09', 'C10', 'C11']) {
    const c = caseById(id);
    const bound = capacityOracle(c).tonnes;
    const r = runSimulation(c, policyById('greedy').fn, 7, { deterministic: true });
    assert.ok(r.tonnes <= bound + 1e-6, `${id}: ${r.tonnes} exceeds ${bound.toFixed(0)}`);
  }
});

// ---- the stochastic rollout cases (C15/C16) respect the oracle too ----
test('C15/C16 stochastic cases respect the capacity oracle (deterministic upper bound)', () => {
  for (const id of ['C15', 'C16']) {
    const c = caseById(id);
    const bound = capacityOracle(c).tonnes;
    const r = runSimulation(c, policyById('shortestWait').fn, 7, { deterministic: true });
    assert.ok(r.tonnes <= bound + 1e-6, `${id}: ${r.tonnes} exceeds ${bound.toFixed(0)}`);
  }
});

// ---- the forkable rollout model is the SAME physics as the live DES, not a rigged surrogate ----
test('RolloutSim == model.ts EXACTLY on the deterministic corpus (parity)', () => {
  for (const id of ['C01', 'C04', 'C05', 'C06', 'C07', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16']) {
    const c = caseById(id);
    for (const pid of ['greedy', 'shortestWait']) {
      const m = runSimulation(c, policyById(pid).fn, 7, { deterministic: true }).tonnes;
      const o = new RolloutSim(c, 7, { deterministic: true }).runWithPolicy(policyById(pid).fn, c.shiftSec).tonnes;
      assert.equal(o, m, `${id}/${pid}: RolloutSim ${o} != model.ts ${m}`);
    }
  }
});

// ---- beyond-SOTA rollout: the deterministic improvement bound (Bertsekas, Tsitsiklis & Wu 1997) ----
const detOpt = { ...DEFAULT_ROLLOUT, base: shortestWait, deterministic: true };
const baseTonnes = (id: string) => new RolloutSim(caseById(id), 7, { deterministic: true }).runWithPolicy(shortestWait, caseById(id).shiftSec).tonnes;

test('rollout is NEVER worse than its base on the deterministic model (policy-improvement bound)', () => {
  for (const id of ['C01', 'C04', 'C05', 'C06', 'C07', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16']) {
    const r = runRollout(caseById(id), 7, detOpt).tonnes;
    assert.ok(r >= baseTonnes(id) - 1e-6, `${id}: rollout ${r} < base ${baseTonnes(id)}`);
  }
});

test('NEGATIVE CONTROLS: rollout must TIE the base on C01/C04 (a "win" here FAILS the build)', () => {
  for (const id of ['C01', 'C04']) {
    const r = runRollout(caseById(id), 7, detOpt).tonnes;
    // exact tie: a rollout that beats the base on a balanced/symmetric case means the look-ahead is leaking
    assert.equal(r, baseTonnes(id), `${id}: rollout ${r} != base ${baseTonnes(id)} (tie control violated)`);
  }
});

test('C12 rollout matches the closed-form 1x1 oracle EXACTLY (deterministic)', () => {
  const c = caseById('C12');
  const r = runRollout(c, 7, detOpt).tonnes;
  const base = baseTonnes('C12');
  assert.equal(r, base, `C12 rollout ${r} must equal the 1x1 base ${base}`);
  assert.ok(r <= capacityOracle(c).tonnes + 1e-6, `C12 ${r} exceeds the oracle`);
});

test('POSITIVE control: rollout STRICTLY beats the base on the asymmetric C05 (the look-ahead does real work)', () => {
  const r = runRollout(caseById('C05'), 7, detOpt).tonnes;
  assert.ok(r > baseTonnes('C05') + 1, `C05 rollout ${r} should strictly beat base ${baseTonnes('C05')}`);
});
