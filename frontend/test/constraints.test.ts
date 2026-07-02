// #22 P3: operational constraints are enforced by the DES for EVERY policy — feasibility
// filtering, queue caps, compatibility, shift breaks, and invalid-choice accounting.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { runSimulation } from '../src/sim/model';
import { caseById } from '../src/sim/cases';
import { policyById } from '../src/policies/heuristics';
import { type CaseSpec, type Policy } from '../src/sim/types';

const withCons = (c: CaseSpec, constraints: CaseSpec['constraints']): CaseSpec => ({ ...c, constraints });

test('maxQueuePerShovel caps commitment even under a herding policy', () => {
  const c = caseById('C06');
  const capped = withCons(c, { maxQueuePerShovel: 2 });
  let maxCommitted = 0;
  runSimulation(capped, policyById('greedy').fn, 7, {
    onDecision: (state) => {
      for (const v of state.shovels) maxCommitted = Math.max(maxCommitted, v.queueLen + v.inbound + (v.loading ? 1 : 0));
    },
  });
  // the FEASIBLE set never shows a shovel at/over the cap — policies cannot over-commit one
  assert.ok(maxCommitted <= 2, `saw committed=${maxCommitted} in the feasible set`);
});

test('compatibility restricts a truck model to its allowed shovels', () => {
  const c = caseById('C06');
  const model = c.fleet.trucks[0].spec.model;
  const only = c.mine.shovels[0].id;
  const compat: Record<number, string[]> = {};
  for (const s of c.mine.shovels) compat[s.id] = s.id === only ? [model] : ['nobody'];
  const r = runSimulation(withCons(c, { compatibility: compat }), policyById('greedy').fn, 7);
  const servedElsewhere = r.shovels.filter((s) => s.id !== only && s.served > 0);
  // after the initial fixed spotting, every DECISION lands on the only compatible shovel;
  // other shovels serve at most their initial start-shovel arrivals
  const started = new Map<number, number>();
  for (const t of c.fleet.trucks) started.set(t.startShovel, (started.get(t.startShovel) ?? 0) + 1);
  for (const s of servedElsewhere) assert.ok(s.served <= (started.get(s.id) ?? 0), `${s.id} served ${s.served}`);
});

test('a shift break delays decisions (tonnes drop, wait grows)', () => {
  const c = caseById('C06');
  const base = runSimulation(c, policyById('greedy').fn, 7);
  const broken = runSimulation(withCons(c, { breaks: [{ startSec: 3600, endSec: 5400 }] }),
    policyById('greedy').fn, 7);
  assert.ok(broken.tonnes < base.tonnes, `break should cost tonnes (${broken.tonnes} vs ${base.tonnes})`);
  assert.ok(broken.truckWaitSec > base.truckWaitSec);
});

test('a policy returning an infeasible id is re-assigned and counted', () => {
  const c = caseById('C06');
  const forbidden = c.mine.shovels[0].id;
  const bad: Policy = () => forbidden;                    // always insists on shovel 0
  const compat: Record<number, string[]> = { [forbidden]: ['nobody'] };   // never compatible
  const r = runSimulation(withCons(c, { compatibility: compat }), bad, 7);
  assert.ok((r.invalidChoices ?? 0) > 0, 'invalid choices must be counted');
  assert.ok(r.tonnes > 0, 're-assignment keeps the shift producing');
});

test('constraints default to a no-op (results unchanged without them)', () => {
  const c = caseById('C06');
  const a = runSimulation(c, policyById('shortestWait').fn, 11);
  const b = runSimulation(withCons(c, undefined), policyById('shortestWait').fn, 11);
  assert.equal(a.tonnes, b.tonnes);
  assert.equal(a.invalidChoices, 0);
});
