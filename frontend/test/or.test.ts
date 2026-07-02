// #22 P1 wiring: the Hungarian policy runs inside the REAL DES with the fleet view populated,
// is deterministic, and does not lose to fixed assignment on a multi-shovel case.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { runSimulation } from '../src/sim/model';
import { caseById } from '../src/sim/cases';
import { policyById } from '../src/policies/heuristics';

test('hungarian policy is registered and runs a full shift', () => {
  const c = caseById('C06');
  const r = runSimulation(c, policyById('hungarian').fn, 7);
  assert.ok(r.tonnes > 0);
  assert.ok(r.matchFactor > 0);
});

test('hungarian is deterministic in (case, seed)', () => {
  const c = caseById('C06');
  const a = runSimulation(c, policyById('hungarian').fn, 11);
  const b = runSimulation(c, policyById('hungarian').fn, 11);
  assert.equal(a.tonnes, b.tonnes);
  assert.equal(a.truckWaitSec, b.truckWaitSec);
});

test('hungarian beats the fixed baseline on the asymmetric multi-shovel case', () => {
  const c = caseById('C06');
  const seeds = [3, 7, 11, 17, 23];
  const med = (xs: number[]) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  const hung = med(seeds.map((s) => runSimulation(c, policyById('hungarian').fn, s).tonnes));
  const fixed = med(seeds.map((s) => runSimulation(c, policyById('fixed').fn, s).tonnes));
  assert.ok(hung > fixed, `hungarian ${hung} should beat fixed ${fixed}`);
});

test('fleet view reaches the policy (joint state, not solo)', () => {
  const c = caseById('C06');
  let sawFleet = 0;
  runSimulation(c, policyById('greedy').fn, 7, {
    onDecision: (state) => { if ((state.fleet?.length ?? 0) >= 1 && state.etaEmptySecFor) sawFleet++; },
  });
  assert.ok(sawFleet > 10, `fleet view present in ${sawFleet} decisions`);
});
