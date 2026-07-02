// #23: the geometry & constraints cases behave per their DOCUMENTED expected bands — the
// archetype is asserted, not assumed.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { runSimulation } from '../src/sim/model';
import { capacityOracle } from '../src/sim/oracle';
import { caseById } from '../src/sim/cases';
import { policyById } from '../src/policies/heuristics';

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

test('C10 the crusher cap is the ceiling: tonnes land in the cap band, not the fleet band', () => {
  const c = caseById('C10');
  const r = runSimulation(c, policyById('greedy').fn, 7);
  const capBand = 2600 * 8;                                // cap tph × shift hours
  // committed-in-flight gating keeps the ceiling a CEILING (the initial pre-assigned wave is
  // allowed: +10%); the conservative commitment accounting may under-deliver, never overshoot
  assert.ok(r.tonnes <= capBand * 1.10, `${r.tonnes} should be capped near ${capBand}`);
  assert.ok(r.tonnes >= capBand * 0.55, `${r.tonnes} should not collapse below the cap band`);
  // and the UNCAPPED twin proves the fleet could do more
  const free = runSimulation({ ...c, constraints: undefined }, policyById('greedy').fn, 7);
  assert.ok(free.tonnes > r.tonnes * 1.1, `uncapped ${free.tonnes} vs capped ${r.tonnes}`);
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
