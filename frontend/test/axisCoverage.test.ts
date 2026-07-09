// AXIS-COVERAGE + MATERIAL-FLOW CI GATE (#67 round 2). A toy / dead / off-road corpus must FAIL the build:
//   * exactly 2-3 SIMPLE cases (>= 4 src, >= 2 dest); every OTHER case >= 6 src, >= 2 dest, >= 1 stockpile.
//   * each stockpile case: the baked (deterministic) level series FILLS to >= 30% of capacity AND draws back
//     down, and the baked trace carries BOTH rehandle legs (shovel->stockpile) AND active reclaim.
//   * TOPOLOGY: the route table + every baked leg is one of the valid material-flow paths ONLY
//     (loaded: ore->crusher, ore->stockpile, waste->waste dump; empty: delivery-point->a same-lane shovel).
//   * empty trucks return to a shovel on a road; none render at the origin / off-road.
//   * every primitive appears >= 1 case (>=4 shovels, multi-dump, waste, multi-crusher, stockpile+reclaim,
//     bays 1 & 2, mixed fleet); the boss C08 is a full network.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { CASES, SIMPLE_CASE_IDS } from '../src/sim/cases';
import { runSimulation } from '../src/sim/model';
import { policyById } from '../src/policies/heuristics';
import { type CaseSpec } from '../src/sim/types';

const isComplex = (c: CaseSpec) => !SIMPLE_CASE_IDS.has(c.id);
const laneOfDump = (c: CaseSpec, id: number) => (c.mine.dumps.find((d) => d.id === id)?.kind === 'waste' ? 'waste' : 'ore');
// one deterministic baked run per case (the gate reads its trace + level series)
const baked = new Map(CASES.map((c) => [c.id, runSimulation(c, policyById('greedy').fn, 7, { deterministic: true, trace: true })]));

test('the corpus has exactly 2-3 SIMPLE cases; every simple case is >= 4 src, >= 2 dest', () => {
  const simple = CASES.filter((c) => SIMPLE_CASE_IDS.has(c.id));
  assert.ok(simple.length >= 2 && simple.length <= 3, `expected 2-3 simple cases, got ${simple.length}`);
  for (const c of simple) {
    assert.ok(c.mine.shovels.length >= 4, `${c.id} simple has ${c.mine.shovels.length} shovels (< 4)`);
    assert.ok(c.mine.dumps.filter((d) => d.kind !== 'stockpile').length >= 2, `${c.id} simple needs >= 2 destinations`);
  }
});

test('every COMPLEX case is >= 6 shovels, >= 2 destinations, and has an intermediate stockpile', () => {
  for (const c of CASES.filter(isComplex)) {
    assert.ok(c.mine.shovels.length >= 6, `${c.id} complex has ${c.mine.shovels.length} shovels (< 6)`);
    assert.ok(c.mine.dumps.filter((d) => d.kind !== 'stockpile').length >= 2, `${c.id} complex needs >= 2 destinations`);
    assert.ok(c.mine.dumps.some((d) => d.kind === 'stockpile'), `${c.id} complex needs a stockpile`);
  }
});

test('source counts SCALE: the corpus reaches 6, 8, and >= 12 shovels; the showcase C08 is large', () => {
  const counts = CASES.map((c) => c.mine.shovels.length);
  assert.ok(counts.some((n) => n >= 6), 'a >= 6-shovel case');
  assert.ok(counts.some((n) => n >= 8), 'an >= 8-shovel case');
  assert.ok(counts.some((n) => n >= 12), 'a >= 12-shovel case');
  assert.ok(CASES.find((c) => c.id === 'C08')!.mine.shovels.length >= 12, 'C08 showcase must be large (>= 12)');
});

test('STOCKPILE cycling: each stockpile fills to >= 30% AND draws down, with rehandle + reclaim traffic', () => {
  for (const c of CASES.filter((x) => x.mine.dumps.some((d) => d.kind === 'stockpile'))) {
    const res = baked.get(c.id)!;
    for (const sp of c.mine.dumps.filter((d) => d.kind === 'stockpile')) {
      const series = res.stockLevels?.[sp.id] ?? [];
      const cap = sp.areaCapacityT ?? 1;
      let max = 0, peak = 0, maxDD = 0, anyDecrease = false, prev = 0;
      for (const p of series) {
        peak = Math.max(peak, p.level); max = Math.max(max, p.level); maxDD = Math.max(maxDD, peak - p.level);
        if (p.level < prev - 1e-9) anyDecrease = true;
        prev = p.level;
      }
      assert.ok(max >= 0.30 * cap, `${c.id} stockpile ${sp.id} only reached ${(max / cap * 100).toFixed(0)}% (< 30%)`);
      assert.ok(maxDD >= 0.10 * cap, `${c.id} stockpile ${sp.id} never drew down (max drawdown ${(maxDD / cap * 100).toFixed(0)}% < 10%)`);
      assert.ok(anyDecrease, `${c.id} stockpile ${sp.id} level never decreased (no active reclaim)`);
      // rehandle legs (a loaded truck hauling to the stockpile) must exist
      const rehandle = (res.trace ?? []).filter((l) => l.state === 'haulFull' && l.node === sp.id).length;
      assert.ok(rehandle > 0, `${c.id} stockpile ${sp.id} received no rehandle legs`);
    }
  }
});

test('TOPOLOGY: the route table contains ONLY valid material-flow paths (any invalid path FAILS)', () => {
  for (const c of CASES) {
    for (const key of Object.keys(c.mine.routes)) {
      const [s, d] = key.split('->').map(Number);
      const sh = c.mine.shovels.find((x) => x.id === s), du = c.mine.dumps.find((x) => x.id === d);
      assert.ok(sh && du, `${c.id} route ${key} references a missing node`);
      const ok = (sh!.faceType === 'ore' && (du!.kind === 'crusher' || du!.kind === 'stockpile'))
              || (sh!.faceType === 'waste' && du!.kind === 'waste');
      assert.ok(ok, `${c.id} INVALID path ${key}: ${sh!.faceType} -> ${du!.kind}`);
    }
  }
});

test('BAKED LEGS are valid: loaded legs are valid material paths; empty legs return to a SAME-LANE shovel on a road; none at the origin', () => {
  for (const c of CASES) {
    const res = baked.get(c.id)!;
    for (const l of res.trace ?? []) {
      assert.ok(!(l.x0 === 0 && l.y0 === 0) && !(l.x1 === 0 && l.y1 === 0), `${c.id} leg at the origin (0,0): ${JSON.stringify(l)}`);
      if (l.state === 'haulFull') {
        const sh = c.mine.shovels.find((x) => x.id === (c.mine.shovels.find((s) => Math.abs(s.pos.x - l.x0) < 1 && Math.abs(s.pos.y - l.y0) < 1)?.id));
        const du = c.mine.dumps.find((x) => x.id === l.node);
        assert.ok(sh && du, `${c.id} loaded leg endpoints do not resolve to nodes`);
        const ok = (sh!.faceType === 'ore' && (du!.kind === 'crusher' || du!.kind === 'stockpile'))
                || (sh!.faceType === 'waste' && du!.kind === 'waste');
        assert.ok(ok, `${c.id} loaded leg is an INVALID path: ${sh!.faceType} -> ${du!.kind}`);
      }
      if (l.state === 'haulEmpty') {
        // empty leg: x0,y0 is the delivery node; the target shovel (l.node) must be same-lane + on a drawn road
        const du = c.mine.dumps.find((x) => Math.abs(x.pos.x - l.x0) < 1 && Math.abs(x.pos.y - l.y0) < 1);
        const sh = c.mine.shovels.find((x) => x.id === l.node);
        assert.ok(du && sh, `${c.id} empty leg endpoints do not resolve to nodes`);
        assert.equal(sh!.faceType, laneOfDump(c, du!.id), `${c.id} empty leg crosses lanes (off-road): ${du!.kind} -> ${sh!.faceType} shovel`);
      }
    }
  }
});

test('every primitive appears in >= 1 case (the fail-if-any-axis-uncovered gate)', () => {
  const has = (pred: (c: CaseSpec) => boolean, name: string) => assert.ok(CASES.some(pred), `axis uncovered: ${name}`);
  has((c) => c.mine.shovels.length >= 4, '>=4 shovels');
  has((c) => c.mine.dumps.length >= 2, 'multi-dump (>=2 destinations)');
  has((c) => c.mine.dumps.some((d) => d.kind === 'waste'), 'waste dump');
  has((c) => c.mine.dumps.filter((d) => d.kind === 'crusher').length >= 2, 'multiple crushers (>1 plant)');
  has((c) => c.mine.dumps.some((d) => d.kind === 'stockpile' && (d.reclaimRateTph ?? 0) > 0 && (d.areaCapacityT ?? 0) > 0), 'stockpile + reclaim');
  has((c) => c.mine.dumps.some((d) => d.kind === 'crusher' && (d.bays ?? 1) === 1), 'crusher-bays == 1');
  has((c) => c.mine.dumps.some((d) => d.kind === 'crusher' && (d.bays ?? 1) === 2), 'crusher-bays == 2');
  has((c) => new Set(c.fleet.trucks.map((t) => t.spec.model)).size >= 2, 'mixed fleet');
  has((c) => c.mine.dumps.some((d) => d.kind === 'stockpile'), 'stockpile instantiated');
});

test('the boss case C08 is a full multi-phase network (>= 12 shovels, 2 crushers + waste + stockpile, mixed fleet)', () => {
  const c = CASES.find((x) => x.id === 'C08')!;
  assert.ok(c.mine.shovels.length >= 12, `C08 has ${c.mine.shovels.length} shovels`);
  const kinds = new Set(c.mine.dumps.map((d) => d.kind));
  assert.ok(kinds.has('crusher') && kinds.has('waste') && kinds.has('stockpile'), 'C08 needs crusher + waste + stockpile');
  assert.ok(c.mine.dumps.filter((d) => d.kind === 'crusher').length >= 2, 'C08 needs >= 2 crushers');
  assert.ok(c.mine.dumps.some((d) => d.kind === 'crusher' && (d.bays ?? 1) >= 2), 'C08 needs a 2-bay crusher');
  assert.ok(new Set(c.fleet.trucks.map((t) => t.spec.model)).size >= 2, 'C08 needs a mixed fleet');
});
