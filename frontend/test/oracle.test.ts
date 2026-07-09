// #22 P2: the capacity oracle bounds DETERMINISTIC runs strictly; stochastic runs stay within a
// 2% noise margin (the 1x1 oracle fixture sits AT the bound by design). The corpus is now all
// multi-source cases, so the 1x1 anchor lives in test/fixtures.ts.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { capacityOracle } from '../src/sim/oracle';
import { runSimulation } from '../src/sim/model';
import { CASES } from '../src/sim/cases';
import { ORACLE_1x1, TIE_SYM } from './fixtures';
import { POLICIES } from '../src/policies/heuristics';

const ALL = [...CASES, ORACLE_1x1, TIE_SYM];

test('deterministic runs NEVER exceed the oracle (the exact claim)', () => {
  for (const c of ALL) {
    const bound = capacityOracle(c).tonnes;
    for (const p of POLICIES) {
      const r = runSimulation(c, p.fn, 7, { deterministic: true });
      assert.ok(r.tonnes <= bound + 1e-6,
        `${c.id}/${p.id} det: ${r.tonnes} exceeds oracle ${bound.toFixed(0)}`);
    }
  }
});

test('stochastic runs stay within the documented 2% noise margin', () => {
  for (const c of ALL) {
    const bound = capacityOracle(c).tonnes;
    for (const p of POLICIES) {
      for (const seed of [3, 7, 11]) {
        const r = runSimulation(c, p.fn, seed);
        assert.ok(r.tonnes <= bound * 1.02,
          `${c.id}/${p.id}/seed${seed}: ${r.tonnes} > oracle ${bound.toFixed(0)} x 1.02`);
      }
    }
  }
});

test('the 1x1 oracle fixture sits AT the bound (>= 90% deterministic)', () => {
  const bound = capacityOracle(ORACLE_1x1).tonnes;
  const r = runSimulation(ORACLE_1x1, POLICIES[0].fn, 7, { deterministic: true });
  assert.ok(r.tonnes / bound >= 0.9, `${r.tonnes}/${bound.toFixed(0)} = ${(r.tonnes / bound).toFixed(2)}`);
});

test('the oracle is not absurdly loose on a balanced case (best policy >= 55%)', () => {
  const bound = capacityOracle(TIE_SYM).tonnes;
  const best = Math.max(...POLICIES.map((p) => runSimulation(TIE_SYM, p.fn, 7).tonnes));
  assert.ok(best / bound >= 0.55, `best ${best} is only ${((best / bound) * 100).toFixed(0)}% of ${bound.toFixed(0)}`);
});

test('binding side is reported and consistent', () => {
  for (const c of ALL) {
    const o = capacityOracle(c);
    assert.ok(o.tonnes > 0);
    assert.ok(o.bindingSide === 'shovels' || o.bindingSide === 'trucks');
  }
});
