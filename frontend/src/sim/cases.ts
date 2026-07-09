// Synthetic-but-physics-grounded cases. No public ground-truthed dispatch benchmark exists (real DISPATCH/
// Wenco cycle logs are proprietary), so the mine is generated from documented physics (rimpull/grade
// kinematics, Erlang load times) and VALIDATED against the closed-form match factor + the oracle controls.
// A real truck-shovel problem is MULTI-SOURCE and MULTI-DESTINATION with intermediate buffers, so the corpus
// is >= 4 shovels (the FLOOR), routes ore to a crusher / waste to a waste dump, runs multiple crushers, gives
// crushers 1-2 receiving bays, and stages ore through stockpiles (rehandle + reclaim). The only sub-4 cases
// are the labelled didactic CONTROLS: the 1x1 oracle (C12) and the single-shovel match-factor sweep (C01-C03).
import { TRUCKS } from './kinematics';
import { type CaseSpec, type MineSpec, type FleetSpec, type ShovelSpec, type DumpSpec, type Route, type PitTopoSpec } from './types';

const SHIFT = 28800; // 8 h

function shovel(id: number, name: string, x: number, y: number, opts: Partial<ShovelSpec> = {}): ShovelSpec {
  return { id, name, pos: { x, y }, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 30, faceType: 'ore', grade: 0.8, ...opts };
}
function crusher(id: number, name: string, x: number, y: number, opts: Partial<DumpSpec> = {}): DumpSpec {
  return { id, name, pos: { x, y }, kind: 'crusher', dumpMeanSec: 60, accepts: ['ore'], ...opts };
}
function waste(id: number, name: string, x: number, y: number, opts: Partial<DumpSpec> = {}): DumpSpec {
  return { id, name, pos: { x, y }, kind: 'waste', dumpMeanSec: 45, accepts: ['waste'], ...opts };
}
/** A stockpile is reached only by REHANDLE (accepts: [], never a normal-routing destination); a reclaimer
 *  draws it down to feed its target crusher. */
function stock(id: number, name: string, x: number, y: number, opts: Partial<DumpSpec> = {}): DumpSpec {
  return { id, name, pos: { x, y }, kind: 'stockpile', dumpMeanSec: 40, accepts: [], areaCapacityT: 20000, reclaimRateTph: 1800, rehandleAtQueue: 2, ...opts };
}
function route(distM: number, gradePct: number, rrPct = 3): Route { return { distM, gradePct, rrPct }; }

function fleet(n: number, model: keyof typeof TRUCKS, shovelIds: number[]): FleetSpec {
  const trucks = Array.from({ length: n }, (_, i) => ({ id: i + 1, spec: TRUCKS[model], startShovel: shovelIds[i % shovelIds.length] }));
  return { trucks };
}
/** A heterogeneous fleet: `a` 793F (218 t) + `b` 930E (290 t), round-robined onto the shovels. */
function mixedFleet(a: number, b: number, shovelIds: number[]): FleetSpec {
  const trucks = [
    ...Array.from({ length: a }, (_, i) => ({ id: i + 1, spec: TRUCKS['793F'], startShovel: shovelIds[i % shovelIds.length] })),
    ...Array.from({ length: b }, (_, i) => ({ id: a + i + 1, spec: TRUCKS['930E'], startShovel: shovelIds[(a + i) % shovelIds.length] })),
  ];
  return { trucks };
}

// ============================================================================================
// Tier 0 - CONTROLS (intentionally sub-4; teach the primitives one at a time, prove correctness)
// ============================================================================================

// ---- C01 balanced single-shovel control (MF~1; greedy must tie the optimisers) ----
const c01Mine: MineSpec = {
  name: 'Single-shovel pit', shovels: [shovel(1, 'Shovel 1', 120, 200)], dumps: [crusher(10, 'Crusher', 520, 120)],
  routes: { '1->10': route(2000, 4) },
};
export const C01: CaseSpec = { id: 'C01', name: 'Control: balanced single-shovel (MF~1)', mine: c01Mine, fleet: fleet(4, '793F', [1]), shiftSec: SHIFT };

// ---- C02 over-trucked degenerate (MF~2; queues dominate, policies converge) ----
export const C02: CaseSpec = { id: 'C02', name: 'Control: over-trucked single-shovel (MF~2)', mine: c01Mine, fleet: fleet(8, '793F', [1]), shiftSec: SHIFT };

// ---- C03 under-trucked (MF<1; shovel sits idle, nothing can feed it) ----
export const C03: CaseSpec = { id: 'C03', name: 'Control: under-trucked single-shovel (MF~0.5)', mine: c01Mine, fleet: fleet(2, '793F', [1]), shiftSec: SHIFT };

// ---- C12 trivial 1-truck-1-shovel oracle (deterministic; throughput = payload*floor(.) exactly) ----
const c12Mine: MineSpec = {
  name: 'Oracle 1x1', shovels: [shovel(1, 'Shovel 1', 150, 200, { spotMeanSec: 0 })], dumps: [crusher(10, 'Crusher', 500, 200)],
  routes: { '1->10': route(1800, 0, 2) },
};
export const C12: CaseSpec = { id: 'C12', name: 'Control: 1-truck-1-shovel oracle', mine: c12Mine, fleet: fleet(1, '793F', [1]), shiftSec: SHIFT };

// ============================================================================================
// Tier 1 - real multi-source topology (>= 4 shovels is the FLOOR from here on)
// ============================================================================================

// ---- C04 four shovels, fully SYMMETRIC (tie control: rollout must equal its base EXACTLY) ----
const c04Mine: MineSpec = {
  name: 'Four-shovel symmetric pit',
  shovels: [shovel(1, 'Shovel 1', 120, 90), shovel(2, 'Shovel 2', 120, 190), shovel(3, 'Shovel 3', 120, 290), shovel(4, 'Shovel 4', 120, 390)],
  dumps: [crusher(10, 'Crusher', 580, 240)],
  routes: { '1->10': route(2200, 4), '2->10': route(2200, 4), '3->10': route(2200, 4), '4->10': route(2200, 4) },
};
export const C04: CaseSpec = { id: 'C04', name: 'Four shovels, symmetric roads (tie control)', mine: c04Mine, fleet: fleet(16, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };

// ---- C05 four shovels, strong ASYMMETRY (positive control: look-ahead beats greedy) ----
const c05Mine: MineSpec = {
  name: 'Four-shovel asymmetric pit',
  shovels: [
    shovel(1, 'Shovel 1 (near)', 150, 110),
    shovel(2, 'Shovel 2 (mid)', 130, 220),
    shovel(3, 'Shovel 3 (far)', 120, 330),
    shovel(4, 'Shovel 4 (far, steep)', 115, 430),
  ],
  dumps: [crusher(10, 'Crusher (2 bays)', 590, 260, { bays: 2 })],   // 2 bays so the SHOVELS/roads bind, not the plant
  routes: { '1->10': route(700, 2), '2->10': route(2600, 4), '3->10': route(4200, 5), '4->10': route(5200, 8, 4) },
};
export const C05: CaseSpec = { id: 'C05', name: 'Four shovels, asymmetric roads (positive control)', mine: c05Mine, fleet: fleet(12, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };

// ---- C06 ore + waste routing to TWO destinations (crusher + waste dump) ----
const c06Mine: MineSpec = {
  name: 'Ore + waste pit (two destinations)',
  shovels: [
    shovel(1, 'Ore 1', 130, 110),
    shovel(2, 'Ore 2', 130, 210),
    shovel(3, 'Waste 1', 130, 330, { faceType: 'waste', grade: 0 }),
    shovel(4, 'Waste 2', 130, 430, { faceType: 'waste', grade: 0 }),
  ],
  dumps: [crusher(10, 'Crusher', 580, 150), waste(20, 'Waste dump', 560, 400)],
  routes: {
    '1->10': route(1800, 3), '2->10': route(2200, 4),
    '3->20': route(1500, 2), '4->20': route(2000, 3),
  },
};
export const C06: CaseSpec = { id: 'C06', name: 'Ore + waste routing (crusher + waste dump)', mine: c06Mine, fleet: fleet(16, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };

// ---- C07 TWO crushers (multiple plants); ore routes to the nearest, each with its own feed KPI ----
const c07Mine: MineSpec = {
  name: 'Two-plant pit',
  shovels: [
    shovel(1, 'Shovel 1', 130, 90), shovel(2, 'Shovel 2', 130, 190),
    shovel(3, 'Shovel 3', 130, 320), shovel(4, 'Shovel 4', 130, 420),
  ],
  dumps: [crusher(10, 'Plant A', 580, 120), crusher(11, 'Plant B', 580, 400)],
  routes: {
    '1->10': route(1600, 3), '1->11': route(3200, 4),
    '2->10': route(1900, 3), '2->11': route(2800, 4),
    '3->10': route(3000, 4), '3->11': route(1700, 3),
    '4->10': route(3400, 5), '4->11': route(1500, 3),
  },
};
export const C07: CaseSpec = { id: 'C07', name: 'Two crushers (nearest-plant routing)', mine: c07Mine, fleet: fleet(18, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };

// ============================================================================================
// Tier 2 - geometry & constraints (#22 physics axes), each >= 4 shovels + a second destination
// ============================================================================================

// C08 deep pit: long 8% ramps, rimpull binds, the FLEET (not the shovels) is the constraint
const c08Mine: MineSpec = {
  name: 'Deep pit, long steep ramps',
  shovels: [
    shovel(1, 'Ore 1 (deep)', 120, 120), shovel(2, 'Ore 2 (deep)', 120, 240), shovel(3, 'Ore 3 (deep)', 120, 360),
    shovel(4, 'Waste (deep)', 120, 470, { faceType: 'waste', grade: 0 }),
  ],
  dumps: [crusher(10, 'Crusher (rim)', 580, 200), waste(20, 'Waste dump (rim)', 560, 430)],
  routes: {
    '1->10': route(4800, 8, 3.5), '2->10': route(5100, 8, 3.5), '3->10': route(5400, 8, 3.5),
    '4->20': route(5000, 8, 3.5),
  },
};
export const C08: CaseSpec = { id: 'C08', name: 'Deep pit (long 8% ramps, truck-bound)', mine: c08Mine, fleet: fleet(16, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };

// C09 shallow pit: short flat roads, travel negligible, the SHOVELS are the constraint
const c09Mine: MineSpec = {
  name: 'Shallow pit, short flat roads',
  shovels: [
    shovel(1, 'Ore 1', 160, 130), shovel(2, 'Ore 2', 160, 240), shovel(3, 'Ore 3', 160, 350),
    shovel(4, 'Waste', 160, 450, { faceType: 'waste', grade: 0 }),
  ],
  dumps: [crusher(10, 'Crusher', 500, 210), waste(20, 'Waste dump', 500, 420)],
  routes: {
    '1->10': route(700, 1, 2), '2->10': route(800, 1, 2), '3->10': route(900, 1, 2),
    '4->20': route(750, 1, 2),
  },
};
export const C09: CaseSpec = { id: 'C09', name: 'Shallow pit (short flat roads, shovel-bound)', mine: c09Mine, fleet: fleet(20, '793F', [1, 2, 3]), shiftSec: SHIFT };

// C10 crusher-limited: the PLANT cap (trailing-hour tph), not the fleet, is the ceiling on the crusher feed;
// ore shovels pause when the crusher saturates. Waste keeps moving to its own dump (uncapped).
const c10Mine: MineSpec = {
  name: 'Crusher-limited pit',
  shovels: [
    shovel(1, 'Ore 1', 120, 110), shovel(2, 'Ore 2', 120, 210), shovel(3, 'Ore 3', 120, 310),
    shovel(4, 'Waste', 120, 430, { faceType: 'waste', grade: 0 }),
  ],
  dumps: [crusher(10, 'Crusher (capped)', 580, 180), waste(20, 'Waste dump', 560, 410)],
  routes: {
    '1->10': route(1300, 3), '2->10': route(1700, 3), '3->10': route(2100, 4),
    '4->20': route(1500, 3),
  },
};
export const C10: CaseSpec = {
  id: 'C10', name: 'Crusher-limited (2.6 kt/h plant cap)', mine: c10Mine,
  fleet: fleet(18, '793F', [1, 2, 3]), shiftSec: SHIFT,
  constraints: { crusherMaxTph: 2600 },
};

// C11 mixed fleet: 793F + 930E share the pit, heterogeneous speeds/payloads (bunching source),
// single crusher so the per-dump feed shows BOTH payload classes (218 and 290) landing.
const c11Mine: MineSpec = {
  name: 'Mixed-fleet pit',
  shovels: [shovel(1, 'Shovel 1', 120, 110), shovel(2, 'Shovel 2', 120, 220), shovel(3, 'Shovel 3', 120, 330), shovel(4, 'Shovel 4', 120, 440)],
  dumps: [crusher(10, 'Crusher', 580, 270)],
  routes: { '1->10': route(1400, 3), '2->10': route(2000, 3), '3->10': route(2600, 4), '4->10': route(3200, 5) },
};
export const C11: CaseSpec = { id: 'C11', name: 'Mixed fleet (793F + 930E)', mine: c11Mine, fleet: mixedFleet(6, 6, [1, 2, 3, 4]), shiftSec: SHIFT };

// ============================================================================================
// Tier 3 - buffers, bays, and the boss
// ============================================================================================

// C13 crusher BAYS + stockpile buffering: a 2-bay crusher, a waste dump, and a stockpile that ore trucks
// REHANDLE onto when both bays are busy and a queue forms; the reclaimer draws the pile down to feed the
// crusher. The stockpile is a SINK that becomes a SOURCE.
// Fast shovels (short spot/load) + short hauls flood a SLOW 2-bay plant, so the crusher (not the shovels) is
// the bottleneck: the queue at the crusher exceeds the rehandle threshold, ore trucks divert onto the
// stockpile, and the reclaimer draws it back down. The stockpile visibly fills and draws.
const c13Mine: MineSpec = {
  name: 'Bays + stockpile pit',
  shovels: [
    shovel(1, 'Ore 1', 130, 100, { loadMeanSec: 95, spotMeanSec: 20 }),
    shovel(2, 'Ore 2', 130, 200, { loadMeanSec: 95, spotMeanSec: 20 }),
    shovel(3, 'Ore 3', 130, 300, { loadMeanSec: 95, spotMeanSec: 20 }),
    shovel(4, 'Waste', 130, 430, { faceType: 'waste', grade: 0 }),
  ],
  dumps: [
    crusher(10, 'Crusher (2 bays)', 590, 150, { bays: 2, dumpMeanSec: 105 }),   // slow plant -> it backs up
    waste(20, 'Waste dump', 560, 430),
    stock(30, 'Stockpile', 400, 300, { areaCapacityT: 24000, reclaimRateTph: 3200, rehandleAtQueue: 3, reclaimTargetId: 10 }),
  ],
  routes: {
    '1->10': route(900, 2), '2->10': route(1100, 2), '3->10': route(1300, 3),
    '1->30': route(750, 2), '2->30': route(900, 2), '3->30': route(1100, 2),
    '4->20': route(1200, 2),
  },
};
export const C13: CaseSpec = { id: 'C13', name: 'Crusher bays + stockpile rehandle', mine: c13Mine, fleet: fleet(22, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };

// C14 THE BOSS: a recognizably real open-pit network. 6 shovels across 2 phases (upper + lower bench),
// 3 dumps (a 2-bay crusher + a waste dump + a stockpile with reclaim), ore/waste routing, rehandle + reclaim,
// and a mixed 793F + 930E fleet (heterogeneous match factor). Everything at once.
const c14Topo: PitTopoSpec = {
  center: { x: 300, y: 270 },
  rimRx: 300, rimRy: 240, nBenches: 6, benchHeightM: 15, benchWidthM: 12, faceAngleDeg: 65, rampWidthM: 25,
  shovelBench: { 1: 3, 2: 3, 3: 4, 4: 5, 5: 6, 6: 6 }, // upper phase (3,4) + lower phase (5,6)
};
const c14Mine: MineSpec = {
  name: 'Large multi-phase pit (the boss)',
  shovels: [
    shovel(1, 'Ore 1 (upper)', 150, 110),
    shovel(2, 'Ore 2 (upper)', 130, 210),
    shovel(3, 'Ore 3 (lower)', 120, 320),
    shovel(4, 'Ore 4 (lower)', 130, 420),
    shovel(5, 'Waste 1 (upper)', 210, 470, { faceType: 'waste', grade: 0 }),
    shovel(6, 'Waste 2 (lower)', 300, 470, { faceType: 'waste', grade: 0 }),
  ],
  dumps: [
    crusher(10, 'Crusher (2 bays)', 600, 130, { bays: 2 }),
    waste(20, 'Waste dump', 590, 440),
    stock(30, 'Stockpile', 430, 260, { areaCapacityT: 28000, reclaimRateTph: 2200, rehandleAtQueue: 2, reclaimTargetId: 10 }),
  ],
  routes: {
    '1->10': route(1700, 3), '2->10': route(2100, 4), '3->10': route(3000, 5), '4->10': route(3600, 6, 4),
    '1->30': route(1300, 2), '2->30': route(1600, 3), '3->30': route(2200, 4), '4->30': route(2700, 5),
    '5->20': route(1800, 3), '6->20': route(2100, 3),
  },
  topo: c14Topo,
};
export const C14: CaseSpec = { id: 'C14', name: 'Boss: 6 shovels, 2 phases, 3 dumps, mixed fleet', mine: c14Mine, fleet: mixedFleet(8, 6, [1, 2, 3, 4, 5, 6]), shiftSec: SHIFT };

// ============================================================================================
// Stochastic regimes (rollout look-ahead), >= 4 shovels
// ============================================================================================

// C15 stochastic cycle times: 4-shovel asymmetric geometry + HIGH-variance load (Erlang k=2, CV~0.71)
// and travel (lognormal CV=0.35). Bunching the mean-cost Hungarian cannot see; a rollout samples it.
const c15Mine: MineSpec = {
  name: 'Stochastic-cycle pit (4 shovels, asymmetric)',
  shovels: [
    shovel(1, 'Shovel 1 (near)', 120, 100, { loadPasses: 2 }),
    shovel(2, 'Shovel 2 (mid)', 120, 210, { loadPasses: 2 }),
    shovel(3, 'Shovel 3 (far)', 120, 320, { loadPasses: 2 }),
    shovel(4, 'Shovel 4 (far)', 120, 430, { loadPasses: 2 }),
  ],
  dumps: [crusher(10, 'Crusher', 580, 265)],
  routes: { '1->10': route(1400, 3), '2->10': route(2400, 4), '3->10': route(3600, 5), '4->10': route(4200, 6) },
};
export const C15: CaseSpec = {
  id: 'C15', name: 'Stochastic cycle times (Erlang load + travel noise)', mine: c15Mine,
  fleet: fleet(16, '793F', [1, 2, 3, 4]), shiftSec: SHIFT, noise: { travelCv: 0.35 },
};

// C16 shovel breakdowns: 4-shovel asymmetric geometry; the NEAR shovel (the one a myopic policy
// over-feeds) fails on a Poisson clock (MTBF 1.5 h, MTTR 0.5 h). A myopic policy keeps committing
// trucks to a dying shovel; a look-ahead that samples failures can hedge onto the healthy ones.
const c16Mine: MineSpec = {
  name: 'Breakdown pit (near shovel fails on a Poisson clock)',
  shovels: [
    shovel(1, 'Shovel 1 (near, fails)', 120, 100, { breakdown: { mtbfSec: 5400, mttrSec: 1800 } }),
    shovel(2, 'Shovel 2 (mid)', 120, 210),
    shovel(3, 'Shovel 3 (far)', 120, 320),
    shovel(4, 'Shovel 4 (far)', 120, 430),
  ],
  dumps: [crusher(10, 'Crusher', 580, 265)],
  routes: { '1->10': route(1400, 3), '2->10': route(2400, 4), '3->10': route(3600, 5), '4->10': route(4200, 6) },
};
export const C16: CaseSpec = {
  id: 'C16', name: 'Shovel breakdowns (Poisson failure + repair)', mine: c16Mine,
  fleet: fleet(16, '793F', [1, 2, 3, 4]), shiftSec: SHIFT, noise: { travelCv: 0.12 },
};

export const CASES: CaseSpec[] = [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16];
export const caseById = (id: string): CaseSpec => CASES.find((c) => c.id === id) ?? C01;
