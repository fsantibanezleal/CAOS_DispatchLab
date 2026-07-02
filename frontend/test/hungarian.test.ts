// #22 P1: the Hungarian solver against hand-solved matrices + the fleet-assignment adapter.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { assignFleet, hungarian } from '../src/policies/hungarian';

test('hungarian solves the classic 3x3 by hand', () => {
  // min assignment: (0->1)=2, (1->0)=3, (2->2)=2 -> total 7 (hand-checked)
  const pick = hungarian([
    [4, 2, 8],
    [3, 5, 7],
    [9, 6, 2],
  ]);
  const total = pick.reduce((acc, j, i) => acc + [[4, 2, 8], [3, 5, 7], [9, 6, 2]][i][j], 0);
  assert.equal(total, 7);
  assert.deepEqual([...pick].sort(), [0, 1, 2]);          // a perfect matching
});

test('hungarian handles rectangular matrices (more workers than tasks)', () => {
  const pick = hungarian([
    [1, 10],
    [2, 1],
    [10, 10],
  ]);
  // two real tasks -> exactly two trucks assigned, the cheap pair (0->0, 1->1), third padded out
  assert.equal(pick.filter((j) => j >= 0).length, 2);
  assert.equal(pick[0], 0);
  assert.equal(pick[1], 1);
  assert.equal(pick[2], -1);
});

test('hungarian is deterministic', () => {
  const m = [
    [5, 9, 1, 4],
    [7, 2, 8, 6],
    [3, 6, 5, 9],
    [8, 4, 7, 2],
  ];
  assert.deepEqual(hungarian(m), hungarian(m));
});

test('assignFleet spreads trucks across shovels when queue-wait prices it in', () => {
  // two identical trucks, two identical shovels: joint optimum sends ONE truck to EACH shovel
  // (a greedy per-truck rule would herd both to the same nearest shovel)
  const trucks = [{ id: 1, readyInSec: 0, atDumpId: 101 }, { id: 2, readyInSec: 0, atDumpId: 101 }];
  const shovels = [
    { id: 1, freeInSec: 0, loadMeanSec: 200 },
    { id: 2, freeInSec: 0, loadMeanSec: 200 },
  ];
  const eta = (_ti: number, sid: number) => (sid === 1 ? 100 : 130);   // shovel 1 slightly closer
  const out = assignFleet(trucks, shovels, eta);
  assert.equal(out.size, 2);
  assert.notEqual(out.get(1), out.get(2));                // split, not herded
});

test('assignFleet respects a busy shovel', () => {
  const trucks = [{ id: 1, readyInSec: 0, atDumpId: 101 }];
  const shovels = [
    { id: 1, freeInSec: 500, loadMeanSec: 200 },          // near but long backlog
    { id: 2, freeInSec: 0, loadMeanSec: 200 },            // farther but idle
  ];
  const eta = (_ti: number, sid: number) => (sid === 1 ? 100 : 250);
  const out = assignFleet(trucks, shovels, eta);
  assert.equal(out.get(1), 2);                            // 250+200 beats 500+200
});
