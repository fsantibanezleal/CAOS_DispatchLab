import { test } from 'node:test';
import assert from 'node:assert/strict';
import { benchRings, buildPitTopo, defaultTopo, sampleAt } from '../src/sim/topo';
import { CASES } from '../src/sim/cases';

const c05 = CASES.find((c) => c.id === 'C05')!;

test('bench rings descend monotonically and shrink inward', () => {
  const spec = defaultTopo(c05.mine);
  const rings = benchRings(spec);
  assert.equal(rings.length, spec.nBenches + 1);
  for (let i = 1; i < rings.length; i++) {
    assert.ok(rings[i].z < rings[i - 1].z, 'z must descend');
    assert.ok(rings[i].rx <= rings[i - 1].rx, 'rx must shrink');
    assert.ok(rings[i].ry <= rings[i - 1].ry, 'ry must shrink');
  }
  assert.equal(rings[0].z, 0);
});

test('spiral ramp connects rim to floor, descending', () => {
  const topo = buildPitTopo(c05.mine);
  const ramp = topo.ramp;
  assert.ok(ramp.length > 20);
  assert.equal(ramp[0].z, 0);
  const zFloor = topo.benches[topo.benches.length - 1].z;
  assert.ok(Math.abs(ramp[ramp.length - 1].z - zFloor) < 1e-6, 'ramp ends at the floor');
  for (let i = 1; i < ramp.length; i++) assert.ok(ramp[i].z <= ramp[i - 1].z + 1e-9, 'ramp never climbs');
});

test('every routed shovel->dump pair gets a continuous 3D path from the bench to the rim', () => {
  const topo = buildPitTopo(c05.mine);
  for (const s of c05.mine.shovels) {
    for (const d of c05.mine.dumps) {
      if (!c05.mine.routes[`${s.id}->${d.id}`]) continue;
      const p = topo.paths[`${s.id}->${d.id}`];
      assert.ok(p, `path ${s.id}->${d.id} exists`);
      assert.ok(p.len > 0);
      // continuity: no jump larger than 80 m between consecutive points
      for (let i = 1; i < p.pts.length; i++) {
        const dstep = Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y, p.pts[i].z - p.pts[i - 1].z);
        assert.ok(dstep < 80, `no teleport (step ${dstep.toFixed(1)} m at ${i})`);
      }
      // starts at the shovel's bench elevation, ends at the dump (rim, z=0)
      const bench = topo.benches[topo.spec.shovelBench[s.id]];
      assert.ok(Math.abs(p.pts[0].z - bench.z) < 1e-6, 'starts at the bench');
      assert.ok(Math.abs(p.pts[p.pts.length - 1].z - 0) < 1e-6, 'ends at the rim');
    }
  }
});

test('sampleAt is arc-length parametrised, clamped, and reversible', () => {
  const topo = buildPitTopo(c05.mine);
  const key = Object.keys(topo.paths)[0];
  const p = topo.paths[key];
  const a0 = sampleAt(p, 0), a1 = sampleAt(p, 1);
  assert.deepEqual(a0, p.pts[0]);
  const last = p.pts[p.pts.length - 1];
  assert.ok(Math.hypot(a1.x - last.x, a1.y - last.y, a1.z - last.z) < 1e-6);
  // reverse: f=0 of the reversed path is the end (the empty leg starts at the dump)
  const r0 = sampleAt(p, 0, true);
  assert.ok(Math.hypot(r0.x - last.x, r0.y - last.y, r0.z - last.z) < 1e-6);
  // halfway point is strictly between the endpoint elevations
  const mid = sampleAt(p, 0.5);
  assert.ok(mid.z <= 0 && mid.z >= p.pts[0].z);
  // out-of-range clamps, never throws
  assert.deepEqual(sampleAt(p, -1), p.pts[0]);
});

test('defaultTopo puts longer-haul shovels on deeper benches', () => {
  const spec = defaultTopo(c05.mine);
  // C05: shovel 1 near (1200 m), shovel 2 far (3600 m) → bench(2) >= bench(1)
  assert.ok(spec.shovelBench[2] >= spec.shovelBench[1]);
});

test('every case builds a topo without throwing (derived default when unspecified)', () => {
  for (const c of CASES) {
    const topo = buildPitTopo(c.mine);
    assert.ok(topo.benches.length >= 2, c.id);
    for (const s of c.mine.shovels) assert.ok(topo.shovelPos3[s.id], `${c.id} shovel ${s.id} placed`);
    for (const d of c.mine.dumps) assert.ok(topo.dumpPos3[d.id], `${c.id} dump ${d.id} placed`);
  }
});
