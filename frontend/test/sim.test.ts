import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation } from '../src/sim/model';
import { speedLimitedSec } from '../src/sim/traffic';
import { analyticalMatchFactor } from '../src/sim/matchfactor';
import { travelTimeSec, TRUCKS } from '../src/sim/kinematics';
import { C01, CASES } from '../src/sim/cases';
import { ORACLE_1x1, TIE_SYM, POS_ASYM } from './fixtures';
import { POLICIES, greedy, minShovelWait } from '../src/policies/heuristics';

test('determinism: same seed -> identical result', () => {
  const a = runSimulation(C01, greedy, 42);
  const b = runSimulation(C01, greedy, 42);
  assert.equal(a.tonnes, b.tonnes);
  assert.equal(a.truckWaitSec, b.truckWaitSec);
  assert.deepEqual(a.shovels, b.shovels);
});

test('different seed -> different stochastic trace (but same order of magnitude)', () => {
  const a = runSimulation(C01, greedy, 1);
  const b = runSimulation(C01, greedy, 2);
  assert.notEqual(a.truckWaitSec, b.truckWaitSec);
  assert.ok(Math.abs(a.tonnes - b.tonnes) / a.tonnes < 0.15);
});

test('1x1 oracle fixture: deterministic throughput = closed-form floor(.)*payload', () => {
  const res = runSimulation(ORACLE_1x1, greedy, 7, { deterministic: true });
  const t = TRUCKS['793F'];
  // one truck => no bunching/meeting; only the posted speed limit clamps the free-flow leg times (#87).
  const hf = speedLimitedSec(travelTimeSec(1800, 0, 2, t, true), 1800);
  const he = speedLimitedSec(travelTimeSec(1800, 0, 2, t, false), 1800);
  const tLoad = 0 + 150, cycle = tLoad + hf + 60 + he, t1 = tLoad + hf + 60;
  const dumps = Math.floor((ORACLE_1x1.shiftSec - t1) / cycle) + 1;
  assert.equal(res.tonnes, dumps * t.payloadT);
});

test('match factor is finite and positive for every case; more trucks => higher MF', () => {
  for (const c of CASES) assert.ok(analyticalMatchFactor(c) > 0, `${c.id} MF`);
  // the 1-truck oracle is well under-trucked; the 16-truck symmetric pit is not
  assert.ok(analyticalMatchFactor(ORACLE_1x1) < analyticalMatchFactor(TIE_SYM));
});

test('every case x policy runs to completion with finite, non-negative KPIs', () => {
  for (const c of CASES) for (const p of POLICIES) {
    const r = runSimulation(c, p.fn, 11);
    assert.ok(Number.isFinite(r.tonnes) && r.tonnes >= 0, `${c.id}/${p.id} tonnes`);
    assert.ok(r.shovels.every((s) => s.util >= 0 && s.util <= 1.0001), `${c.id}/${p.id} util`);
  }
});

test('dispatch matters: policies diverge on the asymmetric positive-control fixture', () => {
  const g = runSimulation(POS_ASYM, greedy, 5);
  const m = runSimulation(POS_ASYM, minShovelWait, 5);
  // the far shovel (#4) is served differently under min-shovel-wait than under greedy
  const far = (r: typeof g) => r.shovels.find((s) => s.id === 4)!.served;
  assert.notEqual(far(g), far(m));
});
