// #22 P2: the capacity oracle bounds DETERMINISTIC runs strictly; stochastic runs stay within a
// 2% noise margin (mean-1 leg/service noise, the trivial 1×1 case sits AT the bound by design).
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { capacityOracle } from '../src/sim/oracle';
import { runSimulation } from '../src/sim/model';
import { CASES } from '../src/sim/cases';
import { POLICIES } from '../src/policies/heuristics';

test('deterministic runs NEVER exceed the oracle (the exact claim)', () => {
  for (const c of CASES) {
    const bound = capacityOracle(c).tonnes;
    for (const p of POLICIES) {
      const r = runSimulation(c, p.fn, 7, { deterministic: true });
      assert.ok(r.tonnes <= bound + 1e-6,
        `${c.id}/${p.id} det: ${r.tonnes} exceeds oracle ${bound.toFixed(0)}`);
    }
  }
});

test('stochastic runs stay within the documented 2% noise margin', () => {
  for (const c of CASES) {
    const bound = capacityOracle(c).tonnes;
    for (const p of POLICIES) {
      for (const seed of [3, 7, 11]) {
        const r = runSimulation(c, p.fn, seed);
        assert.ok(r.tonnes <= bound * 1.02,
          `${c.id}/${p.id}/seed${seed}: ${r.tonnes} > oracle ${bound.toFixed(0)} × 1.02`);
      }
    }
  }
});

test('the trivial 1×1 oracle case sits AT the bound (>= 90% deterministic)', () => {
  const c = CASES.find((x) => x.id === 'C12')!;
  const bound = capacityOracle(c).tonnes;
  const r = runSimulation(c, POLICIES[0].fn, 7, { deterministic: true });
  assert.ok(r.tonnes / bound >= 0.9, `${r.tonnes}/${bound.toFixed(0)} = ${(r.tonnes / bound).toFixed(2)}`);
});

test('the oracle is not absurdly loose on a balanced case (best policy >= 60%)', () => {
  const c = CASES.find((x) => x.id === 'C06')!;
  const bound = capacityOracle(c).tonnes;
  const best = Math.max(...POLICIES.map((p) => runSimulation(c, p.fn, 7).tonnes));
  assert.ok(best / bound >= 0.6, `best ${best} is only ${((best / bound) * 100).toFixed(0)}% of ${bound.toFixed(0)}`);
});

test('binding side is reported and consistent', () => {
  for (const c of CASES) {
    const o = capacityOracle(c);
    assert.ok(o.tonnes > 0);
    assert.ok(o.bindingSide === 'shovels' || o.bindingSide === 'trucks');
  }
});
