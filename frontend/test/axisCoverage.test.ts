// AXIS-COVERAGE CI GATE (#67). The synthetic corpus must exercise every real truck-shovel PRIMITIVE, so it
// can never silently regress to a shovels -> one-crusher toy. Every primitive must appear in >= 1 case; the
// floor is >= 4 shovels (the only sub-4 exceptions are the labelled didactic controls); and the dead
// DumpSpec.kind values ('stockpile', 'waste') must be instantiated by real cases. A missing axis FAILS the
// build. The correctness controls (C01 balanced, C04 tie, C12 exact oracle) live in cases23.test.ts.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { CASES } from '../src/sim/cases';

// The single-shovel didactic controls are the ONLY cases allowed below the >= 4-shovel floor.
const CONTROLS = new Set(['C01', 'C02', 'C03', 'C12']);

test('floor: every non-control case has >= 4 shovels (sub-4 only for the labelled controls)', () => {
  for (const c of CASES) {
    if (CONTROLS.has(c.id)) continue;
    assert.ok(c.mine.shovels.length >= 4, `${c.id} has ${c.mine.shovels.length} shovels (< 4 floor)`);
  }
});

test('no dead DumpSpec.kind values: both "stockpile" and "waste" are instantiated by real cases', () => {
  const kinds = new Set(CASES.flatMap((c) => c.mine.dumps.map((d) => d.kind)));
  assert.ok(kinds.has('waste'), 'no case instantiates a waste dump');
  assert.ok(kinds.has('stockpile'), 'no case instantiates a stockpile');
});

test('every primitive appears in >= 1 case (the fail-if-any-axis-uncovered gate)', () => {
  const has = (pred: (c: (typeof CASES)[number]) => boolean, name: string) => {
    assert.ok(CASES.some(pred), `axis uncovered: ${name}`);
  };
  // >= 4 shovels
  has((c) => c.mine.shovels.length >= 4, '>=4 shovels');
  // multi-dump (>= 2 destinations)
  has((c) => c.mine.dumps.length >= 2, 'multi-dump (>=2 destinations)');
  // waste dump
  has((c) => c.mine.dumps.some((d) => d.kind === 'waste'), 'waste dump');
  // multiple crushers / plants (> 1 crusher)
  has((c) => c.mine.dumps.filter((d) => d.kind === 'crusher').length >= 2, 'multiple crushers (>1 plant)');
  // stockpile with a finite capacity + reclaim rate
  has((c) => c.mine.dumps.some((d) => d.kind === 'stockpile' && (d.reclaimRateTph ?? 0) > 0 && (d.areaCapacityT ?? 0) > 0),
    'stockpile + reclaim');
  // crusher receiving bays: BOTH a 1-bay and a 2-bay crusher must exist somewhere
  has((c) => c.mine.dumps.some((d) => d.kind === 'crusher' && (d.bays ?? 1) === 1), 'crusher-bays == 1');
  has((c) => c.mine.dumps.some((d) => d.kind === 'crusher' && (d.bays ?? 1) === 2), 'crusher-bays == 2');
  // mixed fleet (> 1 truck class)
  has((c) => new Set(c.fleet.trucks.map((t) => t.spec.model)).size >= 2, 'mixed fleet');
});

test('the boss case C14 is a full network (>= 5 shovels, 3 dumps incl. crusher+waste+stockpile, mixed fleet)', () => {
  const c = CASES.find((x) => x.id === 'C14')!;
  assert.ok(c.mine.shovels.length >= 5, `C14 has ${c.mine.shovels.length} shovels`);
  const kinds = new Set(c.mine.dumps.map((d) => d.kind));
  assert.ok(kinds.has('crusher') && kinds.has('waste') && kinds.has('stockpile'), 'C14 needs crusher + waste + stockpile');
  assert.ok(c.mine.dumps.some((d) => d.kind === 'crusher' && (d.bays ?? 1) >= 2), 'C14 crusher needs >= 2 bays');
  assert.ok(new Set(c.fleet.trucks.map((t) => t.spec.model)).size >= 2, 'C14 needs a mixed fleet');
});
