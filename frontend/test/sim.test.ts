import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation } from '../src/sim/model';
import { analyticalMatchFactor } from '../src/sim/matchfactor';
import { travelTimeSec, TRUCKS } from '../src/sim/kinematics';
import { C01, C02, C05, C12, CASES } from '../src/sim/cases';
import { POLICIES, greedy, minShovelWait } from '../src/policies/heuristics';

test('determinism: same seed → identical result', () => {
  const a = runSimulation(C01, greedy, 42);
  const b = runSimulation(C01, greedy, 42);
  assert.equal(a.tonnes, b.tonnes);
  assert.equal(a.truckWaitSec, b.truckWaitSec);
  assert.deepEqual(a.shovels, b.shovels);
});

test('different seed → different stochastic trace (but same order of magnitude)', () => {
  const a = runSimulation(C01, greedy, 1);
  const b = runSimulation(C01, greedy, 2);
  assert.notEqual(a.truckWaitSec, b.truckWaitSec);
  assert.ok(Math.abs(a.tonnes - b.tonnes) / a.tonnes < 0.15);
});

test('C12 oracle: deterministic throughput = closed-form ⌊·⌋·payload', () => {
  const res = runSimulation(C12, greedy, 7, { deterministic: true });
  const t = TRUCKS['793F'];
  const hf = travelTimeSec(1800, 0, 2, t, true), he = travelTimeSec(1800, 0, 2, t, false);
  const tLoad = 0 + 150, cycle = tLoad + hf + 60 + he, t1 = tLoad + hf + 60;
  const dumps = Math.floor((C12.shiftSec - t1) / cycle) + 1;
  assert.equal(res.tonnes, dumps * t.payloadT);
});

test('match factor: C01 ≈ 1 (balanced), C02 ≈ 2 (over-trucked)', () => {
  const mf1 = analyticalMatchFactor(C01), mf2 = analyticalMatchFactor(C02);
  assert.ok(mf1 > 0.8 && mf1 < 1.3, `C01 MF=${mf1}`);
  assert.ok(mf2 > 1.8, `C02 MF=${mf2}`);
});

test('every case × policy runs to completion with finite, non-negative KPIs', () => {
  for (const c of CASES) for (const p of POLICIES) {
    const r = runSimulation(c, p.fn, 11);
    assert.ok(Number.isFinite(r.tonnes) && r.tonnes >= 0, `${c.id}/${p.id} tonnes`);
    assert.ok(r.shovels.every((s) => s.util >= 0 && s.util <= 1.0001), `${c.id}/${p.id} util`);
  }
});

test('dispatch matters: policies diverge on the asymmetric case C05', () => {
  const g = runSimulation(C05, greedy, 5);
  const m = runSimulation(C05, minShovelWait, 5);
  // the far shovel (#2) should be served more under min-shovel-wait than under greedy
  const far = (r: typeof g) => r.shovels.find((s) => s.id === 2)!.served;
  assert.notEqual(far(g), far(m));
});
