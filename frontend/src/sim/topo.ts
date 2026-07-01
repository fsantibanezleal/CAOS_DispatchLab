// Parametric pit topography (pure TS, no three.js — unit-tested in test/topo.test.ts). Builds the terraced
// pit geometry every case's 3D view uses: bench rings at descending elevations, the spiral ramp polyline
// connecting the rim to the floor, 3D positions for shovels (on their bench) and dumps (at the rim), and an
// arc-length-parametrised 3D haul path per route. HONESTY: representational geometry — cycle TIMES always come
// from the DES kinematics (route distM/grade); the 3D path only decides WHERE a truck is drawn at fraction f
// of its leg, so trucks depart/arrive exactly when the (validated) DES says.
import { type MineSpec, type NodePos, type PitTopoSpec } from './types';

export interface Vec3 { x: number; y: number; z: number; }

export interface BenchRing {
  level: number;   // 0 = rim … nBenches = floor
  z: number;       // elevation (0 at rim, negative down)
  rx: number; ry: number; // crest half-axes of this level
}

export interface Path3D { pts: Vec3[]; cum: number[]; len: number; }

export interface PitTopo {
  spec: Required<Pick<PitTopoSpec, 'faceAngleDeg' | 'rampWidthM'>> & PitTopoSpec;
  benches: BenchRing[];               // rim (level 0) … floor (level nBenches)
  ramp: Vec3[];                       // spiral polyline rim → floor (descending)
  shovelPos3: Record<number, Vec3>;   // shovels projected onto their bench
  dumpPos3: Record<number, Vec3>;     // dumps at rim elevation (z=0)
  paths: Record<string, Path3D>;      // `${shovelId}->${dumpId}` — the LOADED direction (shovel → dump)
}

const DEG = Math.PI / 180;

/** Ellipse point at angle theta for half-axes (rx, ry) around c. */
function ellipsePt(c: NodePos, rx: number, ry: number, theta: number, z: number): Vec3 {
  return { x: c.x + rx * Math.cos(theta), y: c.y + ry * Math.sin(theta), z };
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Build an arc-length table for a polyline. */
function toPath(pts: Vec3[]): Path3D {
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist3(pts[i - 1], pts[i]));
  return { pts, cum, len: cum[cum.length - 1] || 1 };
}

/** Sample a path at fraction f∈[0,1] of its LENGTH (arc-length parametrised; reverse for the empty leg). */
export function sampleAt(p: Path3D, f: number, reverse = false): Vec3 {
  const s = Math.max(0, Math.min(1, reverse ? 1 - f : f)) * p.len;
  let i = 1;
  while (i < p.cum.length && p.cum[i] < s) i++;
  if (i >= p.pts.length) return p.pts[p.pts.length - 1];
  const a = p.pts[i - 1], b = p.pts[i];
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const t = (s - p.cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** Per-level crest half-axes: each bench steps in by the berm width + the face setback (height/tan(face)). */
export function benchRings(spec: PitTopoSpec): BenchRing[] {
  const face = (spec.faceAngleDeg ?? 65) * DEG;
  const stepIn = spec.benchWidthM + spec.benchHeightM / Math.tan(face);
  const rings: BenchRing[] = [];
  for (let k = 0; k <= spec.nBenches; k++) {
    rings.push({
      level: k,
      z: -k * spec.benchHeightM || 0,   // `|| 0` avoids -0 (Object.is-strict asserts distinguish it)
      rx: Math.max(30, spec.rimRx - k * stepIn),
      ry: Math.max(30, spec.rimRy - k * stepIn),
    });
  }
  return rings;
}

/** The spiral ramp: descends the pit wall from the rim to the floor, advancing in angle while dropping
 *  linearly, hugging each level's wall radius. thetaPerBench controls how much of the wall one bench uses. */
export function spiralRamp(spec: PitTopoSpec, rings: BenchRing[], theta0 = -90 * DEG, thetaPerBench = 70 * DEG): Vec3[] {
  const N = Math.max(24, spec.nBenches * 14);
  const pts: Vec3[] = [];
  const zFloor = rings[rings.length - 1].z;
  for (let i = 0; i <= N; i++) {
    const u = i / N;                       // 0 rim → 1 floor
    const z = u * zFloor || 0;             // `|| 0` avoids -0 at the rim
    const theta = theta0 + u * spec.nBenches * thetaPerBench;
    // interpolate the wall radius at this depth (between the two adjacent rings), ramp sits slightly inside
    const kf = u * spec.nBenches;
    const k0 = Math.min(spec.nBenches, Math.floor(kf));
    const k1 = Math.min(spec.nBenches, k0 + 1);
    const t = kf - k0;
    const rx = rings[k0].rx + (rings[k1].rx - rings[k0].rx) * t - (spec.rampWidthM ?? 25) / 2;
    const ry = rings[k0].ry + (rings[k1].ry - rings[k0].ry) * t - (spec.rampWidthM ?? 25) / 2;
    pts.push(ellipsePt(spec.center, Math.max(20, rx), Math.max(20, ry), theta, z));
  }
  return pts;
}

/** Nearest point index of a polyline to a given elevation (for ramp entry/exit at a bench). */
function rampIndexAtZ(ramp: Vec3[], z: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < ramp.length; i++) {
    const d = Math.abs(ramp[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** A derived default topography for cases that don't specify one: pit centred on the shovel centroid,
 *  rim reaching past the dumps, shovels spread over the deeper half of the benches by route distance
 *  (longer haul = deeper bench — consistent with a real deepening pit). */
export function defaultTopo(mine: MineSpec): PitTopoSpec {
  const sh = mine.shovels;
  const cx = sh.reduce((a, s) => a + s.pos.x, 0) / sh.length;
  const cy = sh.reduce((a, s) => a + s.pos.y, 0) / sh.length;
  const dumps = mine.dumps;
  const spanToDump = Math.max(...dumps.map((d) => Math.hypot(d.pos.x - cx, d.pos.y - cy)), 300);
  const nBenches = 5;
  // rank shovels by their (min) route distance: longest haul → deepest bench
  const distOf = (sid: number) => Math.min(...dumps.map((d) => mine.routes[`${sid}->${d.id}`]?.distM ?? Infinity));
  const order = [...sh].sort((a, b) => distOf(a.id) - distOf(b.id));
  const shovelBench: Record<number, number> = {};
  order.forEach((s, i) => { shovelBench[s.id] = Math.min(nBenches, 3 + Math.floor((i / Math.max(1, order.length - 1)) * (nBenches - 3))); });
  return {
    center: { x: cx, y: cy },
    rimRx: spanToDump * 0.85, rimRy: spanToDump * 0.7,
    nBenches, benchHeightM: 15, benchWidthM: 12, faceAngleDeg: 65, rampWidthM: 25,
    shovelBench,
  };
}

/** Build the full topo: rings + ramp + node positions + a 3D haul path per route.
 *  Haul path (LOADED, shovel → dump): along the shovel's bench to the ramp entry at that level, up the spiral
 *  to the rim, then across the surface to the dump pad. The empty return renders the same path reversed. */
export function buildPitTopo(mine: MineSpec): PitTopo {
  const spec0 = mine.topo ?? defaultTopo(mine);
  const spec = { faceAngleDeg: 65, rampWidthM: 25, ...spec0 };
  const rings = benchRings(spec);
  const ramp = spiralRamp(spec, rings);

  // shovels: put each on ITS bench ring, at the angle of its authored (x,y) around the centre
  const shovelPos3: Record<number, Vec3> = {};
  for (const s of mine.shovels) {
    const k = Math.max(1, Math.min(spec.nBenches, spec.shovelBench[s.id] ?? spec.nBenches));
    const ring = rings[k];
    const theta = Math.atan2(s.pos.y - spec.center.y, s.pos.x - spec.center.x);
    // stand on the berm just inside the crest of its level
    shovelPos3[s.id] = ellipsePt(spec.center, ring.rx * 0.82, ring.ry * 0.82, theta, ring.z);
  }
  // dumps: at the rim elevation on their authored position, pushed outside the rim if authored inside
  const dumpPos3: Record<number, Vec3> = {};
  for (const d of mine.dumps) {
    const dx = d.pos.x - spec.center.x, dy = d.pos.y - spec.center.y;
    const rN = Math.hypot(dx / (spec.rimRx * 1.12), dy / (spec.rimRy * 1.12));
    const push = rN < 1 && rN > 1e-6 ? 1 / rN : 1;
    dumpPos3[d.id] = { x: spec.center.x + dx * push, y: spec.center.y + dy * push, z: 0 };
  }

  // per-route 3D paths (loaded direction: shovel bench → ramp up → rim → dump)
  const paths: Record<string, Path3D> = {};
  for (const s of mine.shovels) {
    const k = Math.max(1, Math.min(spec.nBenches, spec.shovelBench[s.id] ?? spec.nBenches));
    const ring = rings[k];
    const sp = shovelPos3[s.id];
    const iEntry = rampIndexAtZ(ramp, ring.z);
    const entry = ramp[iEntry];
    // along the bench (arc on the ring from the shovel's angle to the ramp entry's angle)
    const th0 = Math.atan2(sp.y - spec.center.y, sp.x - spec.center.x);
    const th1 = Math.atan2(entry.y - spec.center.y, entry.x - spec.center.x);
    let dth = th1 - th0;
    while (dth > Math.PI) dth -= 2 * Math.PI;
    while (dth < -Math.PI) dth += 2 * Math.PI;
    const benchArc: Vec3[] = [];
    const nA = 10;
    for (let i = 0; i <= nA; i++) {
      benchArc.push(ellipsePt(spec.center, ring.rx * 0.82, ring.ry * 0.82, th0 + dth * (i / nA), ring.z));
    }
    // up the ramp: from the entry index back to the rim (index 0)
    const up = ramp.slice(0, iEntry + 1).reverse();
    for (const d of mine.dumps) {
      if (!mine.routes[`${s.id}->${d.id}`]) continue;
      const dp = dumpPos3[d.id];
      // surface leg (rim exit → dump pad) subdivided ~50 m for uniform sampling
      const exit = up[up.length - 1] ?? benchArc[benchArc.length - 1];
      const surf: Vec3[] = [];
      const nS = Math.max(2, Math.ceil(dist3(exit, dp) / 50));
      for (let i = 1; i <= nS; i++) {
        const t = i / nS;
        surf.push({ x: exit.x + (dp.x - exit.x) * t, y: exit.y + (dp.y - exit.y) * t, z: exit.z + (dp.z - exit.z) * t });
      }
      paths[`${s.id}->${d.id}`] = toPath([...benchArc, ...up, ...surf]);
    }
  }

  return { spec, benches: rings, ramp, shovelPos3, dumpPos3, paths };
}
