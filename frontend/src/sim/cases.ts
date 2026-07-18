// Synthetic-but-physics-grounded cases. No public ground-truthed dispatch benchmark exists (real DISPATCH/
// Wenco cycle logs are proprietary), so each mine is generated from documented physics (rimpull/grade
// kinematics, Erlang load times) and validated against the closed-form match factor + the oracle controls
// (the 1x1 oracle + tie/positive controls live as fixtures in the test suite, not as user tiles).
//
// Round-2 corpus (#67), Felipe's exact design:
//   * 2-3 simple teaching cases: >= 4 shovels, >= 2 destinations, kept simple (routing + match factor).
//   * all other cases are complex and dynamic: >= 6 shovels (scaling to 12), an intermediate ore stockpile
//     that is actively cycled (the crusher is the binding bottleneck so ore trucks constantly rehandle onto
//     the pile and the reclaimer draws it back down), multiple plants + waste dump(s), plus breakdowns /
//     stochastic cycle times / blend windows / shift breaks / phases. The showcase C08 is a 12-shovel,
//     3-phase network with every node type and every dynamic.
//
// Pit portal + internal roads (#67 round 2): every pit has a single exit/portal. A haul is a polyline, a
// loaded truck runs shovel -> internal pit road (`pitRoad`, the ramp climb) -> portal -> a direct surface
// haul (`portalHaul`) -> destination; an empty truck runs the reverse (destination -> portal -> pit road ->
// shovel), always on drawn roads, never a straight shovel->destination line and never to the origin. The DES
// leg time is the sum of the two rimpull segments (`sim/haul.ts`). This portal + internal-road layout, varied
// per pit (deep pit = long steep internal ramps to a deep portal; plane pit = short flat internal roads), is
// the distinct topography, so no two cases look alike.
//
// Material-flow model (domain-correct): the only loaded legs are shovel(ore)->crusher, shovel(ore)->stockpile
// (rehandle), shovel(waste)->waste dump; the only empty move is delivery-point->a shovel of the same lane;
// stockpile->plant is the reclaimer (a non-truck conveyor). Invalid paths are never authored; every authored
// road carries real traffic in the baked trace.
import { TRUCKS } from './kinematics';
import { type CaseSpec, type MineSpec, type FleetSpec, type ShovelSpec, type DumpSpec, type Route, type PitTopoSpec, type NodePos } from './types';

const SHIFT = 28800; // 8 h
const DEG = Math.PI / 180;

/** A node on a bearing `angDeg` and radius `r` around a pit centre, so shovels ring the pit (not a column). */
function at(c: NodePos, r: number, angDeg: number): NodePos {
  return { x: Math.round(c.x + r * Math.cos(angDeg * DEG)), y: Math.round(c.y + r * Math.sin(angDeg * DEG)) };
}

function shovel(id: number, name: string, p: NodePos, opts: Partial<ShovelSpec> = {}): ShovelSpec {
  return { id, name, pos: p, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 30, faceType: 'ore', grade: 0.8, ...opts };
}
function crusher(id: number, name: string, p: NodePos, opts: Partial<DumpSpec> = {}): DumpSpec {
  return { id, name, pos: p, kind: 'crusher', dumpMeanSec: 60, accepts: ['ore'], ...opts };
}
function waste(id: number, name: string, p: NodePos, opts: Partial<DumpSpec> = {}): DumpSpec {
  return { id, name, pos: p, kind: 'waste', dumpMeanSec: 45, accepts: ['waste'], ...opts };
}
/** A stockpile is reached only by rehandle (accepts: [], never a normal-routing destination); a reclaimer
 *  draws it down to feed its target crusher. */
function stock(id: number, name: string, p: NodePos, opts: Partial<DumpSpec> = {}): DumpSpec {
  return { id, name, pos: p, kind: 'stockpile', dumpMeanSec: 40, accepts: [], areaCapacityT: 16000, reclaimRateTph: 2400, rehandleAtQueue: 2, ...opts };
}
/** An internal pit-road / surface-haul segment: distance [m], loaded (climb-out) grade %, rolling resistance %. */
function seg(distM: number, gradePct: number, rrPct = 3): Route { return { distM, gradePct, rrPct }; }

interface PitDef {
  name: string;
  center: NodePos; portal: NodePos;
  shovels: ShovelSpec[]; dumps: DumpSpec[];
  pitRoad: Record<number, Route>;      // shovelId -> internal leg (shovel <-> portal), carries the ramp grade
  haul: Record<number, Route>;         // dumpId   -> surface leg (portal <-> destination), flatter
  adjacency: Record<number, number[]>; // shovelId -> the dump ids it may route to (ore: crushers[+stockpile]; waste: waste dumps)
  topo: PitTopoSpec;
}
/** Assemble a MineSpec from the portal segment layer: the combined `routes` table (adjacency + ranking +
 *  distance-weighted grade) is derived from pitRoad + portalHaul so every legacy consumer keeps working, while
 *  the DES timing + viz polyline use the two segments through the portal (sim/haul.ts). */
function buildMine(d: PitDef): MineSpec {
  const routes: Record<string, Route> = {};
  for (const [sidStr, dids] of Object.entries(d.adjacency)) {
    const sid = Number(sidStr); const a = d.pitRoad[sid];
    for (const did of dids) {
      const b = d.haul[did]; const dist = a.distM + b.distM;
      routes[`${sid}->${did}`] = {
        distM: dist,
        gradePct: Math.round(((a.gradePct * a.distM + b.gradePct * b.distM) / dist) * 100) / 100,
        rrPct: Math.round(((a.rrPct * a.distM + b.rrPct * b.distM) / dist) * 100) / 100,
      };
    }
  }
  return { name: d.name, shovels: d.shovels, dumps: d.dumps, routes, portal: d.portal, pitRoad: d.pitRoad, portalHaul: d.haul, topo: d.topo };
}

/** A fleet with EXPLICIT per-truck start shovels (so each material lane's truck population is exact). */
function fleetOn(model: keyof typeof TRUCKS, starts: number[]): FleetSpec {
  return { trucks: starts.map((s, i) => ({ id: i + 1, spec: TRUCKS[model], startShovel: s })) };
}
/** A heterogeneous fleet: 793F starts + 930E starts, ids in order (the mixed-fleet / bunching axis). */
function mixedOn(a793: number[], b930: number[]): FleetSpec {
  const rows = [...a793.map((s) => ({ m: '793F' as const, s })), ...b930.map((s) => ({ m: '930E' as const, s }))];
  return { trucks: rows.map((r, i) => ({ id: i + 1, spec: TRUCKS[r.m], startShovel: r.s })) };
}

// ============================================================================================
// simple tier (2-3 cases): >= 4 shovels, >= 2 destinations, kept simple (the teaching tier)
// ============================================================================================

// ---- C01 shallow compact pit, ore + waste routing (teach: the 'which dump' decision + match factor) ----
const C01c = { x: 300, y: 300 };
export const C01: CaseSpec = {
  id: 'C01', name: 'Ore + waste routing (shallow pit)', shiftSec: SHIFT,
  fleet: fleetOn('793F', [1, 2, 1, 2, 3, 4, 3, 4, 1, 2, 3, 4]),
  mine: buildMine({
    name: 'Shallow compact pit (ore + waste)', center: C01c, portal: at(C01c, 165, -8),
    shovels: [
      shovel(1, 'Ore 1', at(C01c, 110, 200)),
      shovel(2, 'Ore 2', at(C01c, 115, 158)),
      shovel(3, 'Waste 1', at(C01c, 110, 120), { faceType: 'waste', grade: 0 }),
      shovel(4, 'Waste 2', at(C01c, 115, 78), { faceType: 'waste', grade: 0 }),
    ],
    dumps: [crusher(10, 'Crusher', at(C01c, 330, -16)), waste(20, 'Waste dump', at(C01c, 300, 70))],   // 1-bay crusher
    pitRoad: { 1: seg(450, 2), 2: seg(400, 2), 3: seg(420, 2), 4: seg(460, 2) },
    haul: { 10: seg(950, 1, 2), 20: seg(750, 1, 2) },
    adjacency: { 1: [10], 2: [10], 3: [20], 4: [20] },
    topo: { center: C01c, rimRx: 190, rimRy: 165, nBenches: 3, benchHeightM: 12, benchWidthM: 16, faceAngleDeg: 60, shovelBench: { 1: 2, 2: 2, 3: 2, 4: 3 } },
  }),
};

// ---- C02 two plants on a round pit (teach: two plants, each with its own feed; the lane balances them) ----
const C02c = { x: 300, y: 290 };
export const C02: CaseSpec = {
  id: 'C02', name: 'Two plants (independent feeds)', shiftSec: SHIFT,
  fleet: fleetOn('793F', [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 4]),
  mine: buildMine({
    name: 'Two-plant round pit', center: C02c, portal: at(C02c, 170, 0),
    shovels: [
      shovel(1, 'Shovel 1 (A)', at(C02c, 120, 205)),
      shovel(2, 'Shovel 2 (A)', at(C02c, 120, 250)),
      shovel(3, 'Shovel 3 (B)', at(C02c, 120, 335)),
      shovel(4, 'Shovel 4 (B)', at(C02c, 120, 30)),
    ],
    dumps: [crusher(10, 'Plant A', at(C02c, 300, 40)), crusher(11, 'Plant B', at(C02c, 300, -40))],   // both 1-bay
    pitRoad: { 1: seg(600, 2), 2: seg(520, 2), 3: seg(560, 2), 4: seg(520, 2) },
    haul: { 10: seg(1100, 2, 2), 11: seg(1250, 2, 2) },
    adjacency: { 1: [10], 2: [10], 3: [11], 4: [11] },
    topo: { center: C02c, rimRx: 175, rimRy: 160, nBenches: 4, benchHeightM: 14, benchWidthM: 12, shovelBench: { 1: 3, 2: 3, 3: 2, 4: 2 } },
  }),
};

// ---- C03 ASYMMETRIC roads on a tilted pit (teach: when hauls differ, dispatch matters; look-ahead helps) ----
const C03c = { x: 300, y: 300 };
export const C03: CaseSpec = {
  id: 'C03', name: 'Asymmetric roads (dispatch matters)', shiftSec: SHIFT,
  fleet: fleetOn('793F', [1, 2, 3, 1, 2, 3, 1, 2, 3, 4, 4, 4]),
  mine: buildMine({
    name: 'Asymmetric tilted pit', center: C03c, portal: at(C03c, 150, -20),
    shovels: [
      shovel(1, 'Ore 1 (near)', at(C03c, 90, 205)),
      shovel(2, 'Ore 2 (mid)', at(C03c, 130, 155)),
      shovel(3, 'Ore 3 (far)', at(C03c, 150, 118)),
      shovel(4, 'Waste', at(C03c, 130, 60), { faceType: 'waste', grade: 0 }),
    ],
    dumps: [crusher(10, 'Crusher', at(C03c, 300, -16)), waste(20, 'Waste dump', at(C03c, 300, 55))],   // 1-bay
    pitRoad: { 1: seg(300, 2), 2: seg(1900, 4, 3.5), 3: seg(3400, 6, 4), 4: seg(1000, 3) },
    haul: { 10: seg(700, 1, 2), 20: seg(850, 2, 2) },
    adjacency: { 1: [10], 2: [10], 3: [10], 4: [20] },
    topo: { center: C03c, rimRx: 165, rimRy: 130, nBenches: 6, benchHeightM: 15, benchWidthM: 11, shovelBench: { 1: 2, 2: 4, 3: 6, 4: 3 } },
  }),
};

// ============================================================================================
// complex / dynamic tier: >= 6 shovels, an actively-cycled ore stockpile, multi-destination, dynamics
// ============================================================================================

// ---- C04 deep narrow pit (haul-bound): long 8-9% internal ramps, an active stockpile, stochastic cycles ----
const C04c = { x: 300, y: 300 };
export const C04: CaseSpec = {
  id: 'C04', name: 'Deep narrow pit (stockpile + stochastic cycles)', shiftSec: SHIFT,
  fleet: fleetOn('793F', [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 5, 6, 5, 6]),
  noise: { travelCv: 0.30 },
  constraints: { breaks: [{ startSec: 4 * 3600, endSec: 4.5 * 3600 }] },
  mine: buildMine({
    name: 'Deep narrow pit (long steep ramps)', center: C04c, portal: at(C04c, 145, -12),
    shovels: [
      shovel(1, 'Ore 1 (deep)', at(C04c, 70, 205), { loadPasses: 2 }),
      shovel(2, 'Ore 2 (deep)', at(C04c, 95, 168), { loadPasses: 2 }),
      shovel(3, 'Ore 3 (deep)', at(C04c, 110, 132), { loadPasses: 2 }),
      shovel(4, 'Ore 4 (deep)', at(C04c, 120, 98), { loadPasses: 2 }),
      shovel(5, 'Waste 1', at(C04c, 95, 300), { faceType: 'waste', grade: 0 }),
      shovel(6, 'Waste 2', at(C04c, 110, 335), { faceType: 'waste', grade: 0 }),
    ],
    dumps: [
      crusher(10, 'Crusher (2 bays)', at(C04c, 300, -20), { bays: 2, dumpMeanSec: 150 }),   // slow -> backs up
      waste(20, 'Waste dump', at(C04c, 290, 60)),
      stock(30, 'Stockpile', at(C04c, 235, 18), { areaCapacityT: 10000, reclaimRateTph: 3800, rehandleAtQueue: 2, reclaimTargetId: 10 }),
    ],
    pitRoad: { 1: seg(3600, 9, 3.5), 2: seg(3900, 9, 3.5), 3: seg(4300, 8, 3.5), 4: seg(4600, 8, 3.5), 5: seg(2000, 5, 3.5), 6: seg(2300, 5, 3.5) },
    haul: { 10: seg(800, 1, 2), 20: seg(700, 2, 2), 30: seg(600, 1, 2) },
    adjacency: { 1: [10, 30], 2: [10, 30], 3: [10, 30], 4: [10, 30], 5: [20], 6: [20] },
    topo: { center: C04c, rimRx: 150, rimRy: 130, nBenches: 9, benchHeightM: 16, benchWidthM: 9, faceAngleDeg: 68, rampWidthM: 22, shovelBench: { 1: 6, 2: 7, 3: 8, 4: 9, 5: 4, 6: 5 } },
  }),
};

// ---- C05 shallow wide pit (shovel-bound): short flat roads, a slow crusher, an active stockpile ----
const C05c = { x: 300, y: 290 };
export const C05: CaseSpec = {
  id: 'C05', name: 'Shallow wide pit (shovel-bound, active stockpile)', shiftSec: SHIFT,
  fleet: fleetOn('793F', [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 6, 7, 8, 6, 7]),
  noise: { travelCv: 0.30 },
  constraints: { breaks: [{ startSec: 4 * 3600, endSec: 4.5 * 3600 }] },
  mine: buildMine({
    name: 'Shallow wide pit (short flat roads)', center: C05c, portal: at(C05c, 205, -5),
    shovels: [
      shovel(1, 'Ore 1', at(C05c, 150, 190), { loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(2, 'Ore 2', at(C05c, 145, 215), { loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(3, 'Ore 3', at(C05c, 150, 160), { loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(4, 'Ore 4', at(C05c, 160, 235), { loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(5, 'Ore 5', at(C05c, 150, 138), { loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(6, 'Waste 1', at(C05c, 150, 300), { faceType: 'waste', grade: 0 }),
      shovel(7, 'Waste 2', at(C05c, 155, 332), { faceType: 'waste', grade: 0 }),
      shovel(8, 'Waste 3', at(C05c, 160, 22), { faceType: 'waste', grade: 0 }),
    ],
    dumps: [
      crusher(10, 'Crusher (2 bays)', at(C05c, 320, -6), { bays: 2, dumpMeanSec: 100 }),
      waste(20, 'Waste dump', at(C05c, 300, 75)),
      stock(30, 'Stockpile', at(C05c, 260, 22), { areaCapacityT: 11000, reclaimRateTph: 4200, rehandleAtQueue: 2, reclaimTargetId: 10 }),
    ],
    pitRoad: { 1: seg(420, 1, 2), 2: seg(380, 1, 2), 3: seg(460, 1, 2), 4: seg(360, 1, 2), 5: seg(480, 1, 2), 6: seg(400, 1, 2), 7: seg(440, 1, 2), 8: seg(520, 1, 2) },
    haul: { 10: seg(700, 1, 2), 20: seg(600, 1, 2), 30: seg(520, 1, 2) },
    adjacency: { 1: [10, 30], 2: [10, 30], 3: [10, 30], 4: [10, 30], 5: [10, 30], 6: [20], 7: [20], 8: [20] },
    topo: { center: C05c, rimRx: 215, rimRy: 185, nBenches: 2, benchHeightM: 11, benchWidthM: 20, faceAngleDeg: 55, shovelBench: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 2, 7: 2, 8: 1 } },
  }),
};

// ---- C06 two-plant network with a shovel breakdown + a mixed fleet + an active stockpile ----
const C06c = { x: 300, y: 290 };
export const C06: CaseSpec = {
  id: 'C06', name: 'Two-plant network (breakdown + mixed fleet + stockpile)', shiftSec: SHIFT,
  fleet: mixedOn([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 1, 2, 3, 4, 7, 8, 7, 8]),
  noise: { travelCv: 0.18 },
  constraints: { breaks: [{ startSec: 4 * 3600, endSec: 4.5 * 3600 }] },
  mine: buildMine({
    name: 'Two-plant network (breakdown + mixed fleet)', center: C06c, portal: at(C06c, 165, -6),
    shovels: [
      shovel(1, 'Ore 1 (near, fails)', at(C06c, 95, 205), { breakdown: { mtbfSec: 5400, mttrSec: 1500 } }),
      shovel(2, 'Ore 2', at(C06c, 120, 172)),
      shovel(3, 'Ore 3', at(C06c, 130, 142)),
      shovel(4, 'Ore 4', at(C06c, 125, 250)),
      shovel(5, 'Ore 5', at(C06c, 130, 32)),
      shovel(6, 'Ore 6', at(C06c, 135, 62)),
      shovel(7, 'Waste 1', at(C06c, 120, 300), { faceType: 'waste', grade: 0 }),
      shovel(8, 'Waste 2', at(C06c, 130, 335), { faceType: 'waste', grade: 0 }),
    ],
    dumps: [
      crusher(10, 'Plant A (2 bays)', at(C06c, 290, 30), { bays: 2, dumpMeanSec: 114 }),
      crusher(11, 'Plant B', at(C06c, 300, -32)),   // 1-bay
      waste(20, 'Waste dump', at(C06c, 285, 78)),
      stock(30, 'Stockpile', at(C06c, 235, 12), { areaCapacityT: 11000, reclaimRateTph: 3600, rehandleAtQueue: 2, reclaimTargetId: 10 }),
    ],
    pitRoad: { 1: seg(700, 3, 3.5), 2: seg(1000, 3, 3.5), 3: seg(1300, 4, 3.5), 4: seg(900, 3, 3.5), 5: seg(900, 3, 3.5), 6: seg(1100, 3, 3.5), 7: seg(700, 3), 8: seg(1000, 3) },
    haul: { 10: seg(900, 2, 2), 11: seg(1000, 2, 2), 20: seg(800, 2, 2), 30: seg(700, 1, 2) },
    adjacency: { 1: [10, 30], 2: [10, 30], 3: [10, 30], 4: [10, 30], 5: [11], 6: [11], 7: [20], 8: [20] },
    topo: { center: C06c, rimRx: 185, rimRy: 155, nBenches: 6, benchHeightM: 15, benchWidthM: 11, shovelBench: { 1: 2, 2: 4, 3: 5, 4: 3, 5: 3, 6: 4, 7: 3, 8: 4 } },
  }),
};

// ---- C07 CRUSHER-LIMITED blend pit: a hard plant cap forces heavy rehandle onto a big stockpile ----
const C07c = { x: 300, y: 295 };
export const C07: CaseSpec = {
  id: 'C07', name: 'Crusher-limited blend (heavy rehandle)', shiftSec: SHIFT,
  fleet: fleetOn('793F', [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2, 7, 8, 7, 8]),
  noise: { travelCv: 0.22 },
  blendWindow: { min: 0.75, max: 0.95 },
  constraints: { breaks: [{ startSec: 4 * 3600, endSec: 4.5 * 3600 }] },
  mine: buildMine({
    name: 'Crusher-limited blend pit', center: C07c, portal: at(C07c, 170, -5),
    shovels: [
      shovel(1, 'Ore 1', at(C07c, 110, 205), { grade: 0.9, loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(2, 'Ore 2', at(C07c, 130, 170), { grade: 0.7, loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(3, 'Ore 3', at(C07c, 135, 140), { grade: 1.1, loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(4, 'Ore 4', at(C07c, 130, 248), { grade: 0.6, loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(5, 'Ore 5', at(C07c, 135, 35), { grade: 1.0, loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(6, 'Ore 6', at(C07c, 140, 65), { grade: 0.8, loadMeanSec: 120, spotMeanSec: 25 }),
      shovel(7, 'Waste 1', at(C07c, 125, 300), { faceType: 'waste', grade: 0 }),
      shovel(8, 'Waste 2', at(C07c, 135, 335), { faceType: 'waste', grade: 0 }),
    ],
    dumps: [
      crusher(10, 'Crusher (2 bays, slow)', at(C07c, 300, -6), { bays: 2, dumpMeanSec: 128 }),
      waste(20, 'Waste dump', at(C07c, 285, 70)),
      stock(30, 'Stockpile', at(C07c, 240, 30), { areaCapacityT: 11000, reclaimRateTph: 3600, rehandleAtQueue: 1, reclaimTargetId: 10 }),
    ],
    pitRoad: { 1: seg(700, 3, 3.5), 2: seg(1000, 3, 3.5), 3: seg(1300, 4, 3.5), 4: seg(800, 3, 3.5), 5: seg(1100, 3, 3.5), 6: seg(1400, 4, 3.5), 7: seg(700, 3), 8: seg(1000, 3) },
    haul: { 10: seg(800, 2, 2), 20: seg(700, 2, 2), 30: seg(600, 1, 2) },
    adjacency: { 1: [10, 30], 2: [10, 30], 3: [10, 30], 4: [10, 30], 5: [10, 30], 6: [10, 30], 7: [20], 8: [20] },
    topo: { center: C07c, rimRx: 180, rimRy: 155, nBenches: 5, benchHeightM: 14, benchWidthM: 12, shovelBench: { 1: 2, 2: 3, 3: 4, 4: 3, 5: 3, 6: 4, 7: 3, 8: 4 } },
  }),
};

// ============================================================================================
// The boss / showcase: a large 12-shovel, 3-phase network with every node type + every dynamic
// ============================================================================================

// ---- C08 the boss: 12 shovels across 3 phases, 2 crushers (2-bay + 1-bay), 2 waste dumps, a stockpile ----
const C08c = { x: 320, y: 300 };
export const C08: CaseSpec = {
  id: 'C08', name: 'Boss: 12 shovels, 3 phases, all node types + dynamics', shiftSec: SHIFT,
  fleet: mixedOn([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 9, 10, 11, 12], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  noise: { travelCv: 0.22 },
  blendWindow: { min: 0.7, max: 0.95 },
  constraints: { breaks: [{ startSec: 4 * 3600, endSec: 4.5 * 3600 }] },
  mine: buildMine({
    name: 'Large multi-phase pit (the boss)', center: C08c, portal: at(C08c, 250, -12),
    shovels: [
      shovel(1, 'Ore 1 (upper)', at(C08c, 155, 195)),
      shovel(2, 'Ore 2 (upper, fails)', at(C08c, 165, 220), { breakdown: { mtbfSec: 6000, mttrSec: 1500 } }),
      shovel(3, 'Ore 3 (mid)', at(C08c, 130, 165), { loadPasses: 3 }),
      shovel(4, 'Ore 4 (mid)', at(C08c, 110, 138), { loadPasses: 3 }),
      shovel(5, 'Ore 5 (lower)', at(C08c, 88, 118), { loadPasses: 2 }),
      shovel(6, 'Ore 6 (lower)', at(C08c, 72, 92), { loadPasses: 2 }),
      shovel(7, 'Ore 7 (deep)', at(C08c, 62, 58), { loadPasses: 2 }),
      shovel(8, 'Ore 8 (deep)', at(C08c, 72, 26), { loadPasses: 2 }),
      shovel(9, 'Waste 1 (upper)', at(C08c, 155, 300), { faceType: 'waste', grade: 0 }),
      shovel(10, 'Waste 2 (mid)', at(C08c, 125, 330), { faceType: 'waste', grade: 0 }),
      shovel(11, 'Waste 3 (lower)', at(C08c, 100, 352), { faceType: 'waste', grade: 0 }),
      shovel(12, 'Waste 4 (deep)', at(C08c, 82, 15), { faceType: 'waste', grade: 0 }),
    ],
    dumps: [
      crusher(10, 'Plant A (2 bays)', at(C08c, 360, -18), { bays: 2, dumpMeanSec: 172 }),
      crusher(11, 'Plant B', at(C08c, 360, 40)),   // 1-bay
      waste(20, 'Waste dump N', at(C08c, 340, 60)),
      waste(21, 'Waste dump S', at(C08c, 350, 30)),
      stock(30, 'Stockpile', at(C08c, 290, -8), { areaCapacityT: 10000, reclaimRateTph: 3000, rehandleAtQueue: 1, reclaimTargetId: 10 }),
    ],
    pitRoad: {
      1: seg(900, 3, 3.5), 2: seg(1100, 3, 3.5), 3: seg(1600, 4, 3.5), 4: seg(2100, 5, 3.5),
      5: seg(2700, 6, 4), 6: seg(3100, 6, 4), 7: seg(3600, 7, 4), 8: seg(4000, 7, 4),
      9: seg(1000, 3), 10: seg(1500, 4), 11: seg(2000, 5), 12: seg(2600, 6, 4),
    },
    haul: { 10: seg(900, 2, 2), 11: seg(1200, 2, 2), 20: seg(900, 2, 2), 21: seg(800, 2, 2), 30: seg(700, 1, 2) },
    adjacency: {
      1: [10, 30], 2: [10, 30], 3: [10, 30], 4: [10, 30],
      5: [11], 6: [11], 7: [11], 8: [11],
      9: [20], 10: [20], 11: [21], 12: [21],
    },
    topo: { center: C08c, rimRx: 295, rimRy: 245, nBenches: 7, benchHeightM: 15, benchWidthM: 13, faceAngleDeg: 64, rampWidthM: 26,
      shovelBench: { 1: 2, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 7, 9: 3, 10: 4, 11: 5, 12: 6 } },
  }),
};

export const CASES: CaseSpec[] = [C01, C02, C03, C04, C05, C06, C07, C08];
export const caseById = (id: string): CaseSpec => CASES.find((c) => c.id === id) ?? C08;

// simple teaching cases (>= 4 shovels, >= 2 destinations, no stockpile required); every other case is
// complex/dynamic with an actively-cycled ore stockpile. Kept as a named set for the axis-coverage gate.
export const SIMPLE_CASE_IDS = new Set(['C01', 'C02', 'C03']);
