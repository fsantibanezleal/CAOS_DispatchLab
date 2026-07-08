// Synthetic-but-physics-grounded cases. No public ground-truthed dispatch benchmark exists (real DISPATCH/
// Wenco cycle logs are proprietary), so the mine is generated from documented physics (rimpull/grade
// kinematics, Erlang load times) and VALIDATED against the closed-form match factor + the oracle controls.
// Each case fixes a point in {fleet balance × #shovels × topology × stochasticity}. More cases (blend,
// mixed-fleet, breakdowns, large pit) build on this set.
import { TRUCKS } from './kinematics';
import { type CaseSpec, type MineSpec, type FleetSpec, type ShovelSpec, type DumpSpec, type Route } from './types';

const SHIFT = 28800; // 8 h

function shovel(id: number, name: string, x: number, y: number, opts: Partial<ShovelSpec> = {}): ShovelSpec {
  return { id, name, pos: { x, y }, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 30, faceType: 'ore', grade: 0.8, ...opts };
}
function crusher(id: number, name: string, x: number, y: number, opts: Partial<DumpSpec> = {}): DumpSpec {
  return { id, name, pos: { x, y }, kind: 'crusher', dumpMeanSec: 60, accepts: ['ore'], ...opts };
}
function route(distM: number, gradePct: number, rrPct = 3): Route { return { distM, gradePct, rrPct }; }

function fleet(n: number, model: keyof typeof TRUCKS, shovelIds: number[]): FleetSpec {
  const trucks = Array.from({ length: n }, (_, i) => ({ id: i + 1, spec: TRUCKS[model], startShovel: shovelIds[i % shovelIds.length] }));
  return { trucks };
}

// ---- C01 balanced single-shovel control (MF≈1; greedy must tie the optimisers) ----
const c01Mine: MineSpec = {
  name: 'Single-shovel pit', shovels: [shovel(1, 'Shovel 1', 120, 200)], dumps: [crusher(10, 'Crusher', 520, 120)],
  routes: { '1->10': route(2000, 4) },
};
export const C01: CaseSpec = { id: 'C01', name: 'Balanced single-shovel (MF≈1)', mine: c01Mine, fleet: fleet(4, '793F', [1]), shiftSec: SHIFT };

// ---- C02 over-trucked degenerate (MF≈2; queues dominate, policies converge) ----
export const C02: CaseSpec = { id: 'C02', name: 'Over-trucked (MF≈2)', mine: c01Mine, fleet: fleet(8, '793F', [1]), shiftSec: SHIFT };

// ---- C05 asymmetric roads (one shovel near, one far → greedy vs shortest-wait diverge) ----
const c05Mine: MineSpec = {
  name: 'Two-shovel asymmetric pit',
  shovels: [shovel(1, 'Shovel 1 (near)', 120, 120), shovel(2, 'Shovel 2 (far)', 120, 320)],
  dumps: [crusher(10, 'Crusher', 560, 220)],
  routes: { '1->10': route(1200, 3), '2->10': route(3600, 5) },
};
export const C05: CaseSpec = { id: 'C05', name: 'Asymmetric roads (near + far shovel)', mine: c05Mine, fleet: fleet(8, '793F', [1, 2]), shiftSec: SHIFT };

// ---- C03 under-trucked (MF<1; shovel sits idle, min-shovel-wait helps least, nothing can feed it) ----
export const C03: CaseSpec = { id: 'C03', name: 'Under-trucked (MF≈0.5)', mine: c01Mine, fleet: fleet(2, '793F', [1]), shiftSec: SHIFT };

// ---- C04 two shovels, symmetric roads (no asymmetry to exploit → greedy ≈ shortest-wait) ----
const c04Mine: MineSpec = {
  name: 'Two-shovel symmetric pit',
  shovels: [shovel(1, 'Shovel 1', 120, 120), shovel(2, 'Shovel 2', 120, 320)],
  dumps: [crusher(10, 'Crusher', 560, 220)],
  routes: { '1->10': route(2200, 4), '2->10': route(2200, 4) },
};
export const C04: CaseSpec = { id: 'C04', name: 'Two shovels, symmetric roads (MF≈1)', mine: c04Mine, fleet: fleet(8, '793F', [1, 2]), shiftSec: SHIFT };

// ---- C12 trivial 1-truck-1-shovel oracle (deterministic; throughput = payload·⌊·⌋ exactly) ----
const c12Mine: MineSpec = {
  name: 'Oracle 1×1', shovels: [shovel(1, 'Shovel 1', 150, 200, { spotMeanSec: 0 })], dumps: [crusher(10, 'Crusher', 500, 200)],
  routes: { '1->10': route(1800, 0, 2) },
};
export const C12: CaseSpec = { id: 'C12', name: '1-truck-1-shovel oracle', mine: c12Mine, fleet: fleet(1, '793F', [1]), shiftSec: SHIFT };

// ---- C06 three shovels, mixed distances (a real multi-way dispatch choice, where learning matters) ----
const c06Mine: MineSpec = {
  name: 'Three-shovel pit',
  shovels: [shovel(1, 'Shovel 1 (near)', 120, 110), shovel(2, 'Shovel 2 (mid)', 120, 220), shovel(3, 'Shovel 3 (far)', 120, 330)],
  dumps: [crusher(10, 'Crusher', 560, 220)],
  routes: { '1->10': route(1400, 3), '2->10': route(2400, 4), '3->10': route(3600, 5) },
};
export const C06: CaseSpec = { id: 'C06', name: 'Three shovels, mixed distances', mine: c06Mine, fleet: fleet(12, '793F', [1, 2, 3]), shiftSec: SHIFT };

// ---- C07 four shovels, asymmetric + a near/far split (rich assignment space) ----
const c07Mine: MineSpec = {
  name: 'Four-shovel pit',
  shovels: [shovel(1, 'Shovel 1', 110, 90), shovel(2, 'Shovel 2', 110, 190), shovel(3, 'Shovel 3', 110, 290), shovel(4, 'Shovel 4 (far)', 110, 390)],
  dumps: [crusher(10, 'Crusher', 580, 240)],
  routes: { '1->10': route(1500, 3), '2->10': route(2000, 4), '3->10': route(2600, 4), '4->10': route(4000, 6) },
};
export const C07: CaseSpec = { id: 'C07', name: 'Four shovels, asymmetric', mine: c07Mine, fleet: fleet(18, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };

// ---- #23 geometry & constraints category, the physics axes (#22) exercised as CASES ----

// C08 deep pit: long 8% ramps, rimpull binds, the fleet (not the shovels) is the constraint
const c08Mine: MineSpec = {
  name: 'Deep pit, long steep ramps',
  shovels: [shovel(1, 'Shovel 1 (deep)', 120, 140), shovel(2, 'Shovel 2 (deep)', 120, 300)],
  dumps: [crusher(10, 'Crusher (rim)', 560, 220)],
  routes: { '1->10': route(4800, 8, 3.5), '2->10': route(5400, 8, 3.5) },
};
export const C08: CaseSpec = { id: 'C08', name: 'Deep pit (long 8% ramps)', mine: c08Mine, fleet: fleet(14, '793F', [1, 2]), shiftSec: SHIFT };

// C09 shallow pit: short flat roads, travel is negligible, the SHOVELS are the constraint
const c09Mine: MineSpec = {
  name: 'Shallow pit, short flat roads',
  shovels: [shovel(1, 'Shovel 1', 160, 150), shovel(2, 'Shovel 2', 160, 290)],
  dumps: [crusher(10, 'Crusher', 480, 220)],
  routes: { '1->10': route(700, 1, 2), '2->10': route(900, 1, 2) },
};
export const C09: CaseSpec = { id: 'C09', name: 'Shallow pit (short flat roads)', mine: c09Mine, fleet: fleet(8, '793F', [1, 2]), shiftSec: SHIFT };

// C10 crusher-limited: the PLANT cap (trailing-hour tph), not the fleet, is the ceiling , 
// baked operational constraints (#22); ore shovels pause when the crusher saturates
const c10Mine: MineSpec = {
  name: 'Crusher-limited pit',
  shovels: [shovel(1, 'Shovel 1', 120, 120), shovel(2, 'Shovel 2', 120, 220), shovel(3, 'Shovel 3', 120, 320)],
  dumps: [crusher(10, 'Crusher (capped)', 560, 220)],
  routes: { '1->10': route(1300, 3), '2->10': route(1700, 3), '3->10': route(2100, 4) },
};
export const C10: CaseSpec = {
  id: 'C10', name: 'Crusher-limited (2.6 kt/h cap)', mine: c10Mine,
  fleet: fleet(14, '793F', [1, 2, 3]), shiftSec: SHIFT,
  constraints: { crusherMaxTph: 2600 },
};

// C11 mixed fleet: 793F + 930E share the pit, heterogeneous speeds/payloads (bunching source)
const mixedFleet: FleetSpec = {
  trucks: [
    ...Array.from({ length: 6 }, (_, i) => ({ id: i + 1, spec: TRUCKS['793F'], startShovel: [1, 2, 3][i % 3] })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: i + 7, spec: TRUCKS['930E'], startShovel: [1, 2, 3][i % 3] })),
  ],
};
export const C11: CaseSpec = { id: 'C11', name: 'Mixed fleet (793F + 930E)', mine: c06Mine, fleet: mixedFleet, shiftSec: SHIFT };

// ---- #rollout stochastic regime, the cases where MYOPIC assignment is genuinely suboptimal ----
// (the regimes the beyond-SOTA Monte-Carlo rollout can defensibly help; a deterministic myopic pick
//  optimises the instantaneous mean cost and ignores variance-driven bunching / failure risk).

// C15 stochastic cycle times: 3-shovel asymmetric geometry + HIGH-variance load (Erlang k=2, CV≈0.71)
// and travel (lognormal CV=0.35). Bunching the mean-cost Hungarian cannot see; a rollout samples it.
const c15Mine: MineSpec = {
  name: 'Stochastic-cycle pit (3 shovels, asymmetric)',
  shovels: [
    shovel(1, 'Shovel 1 (near)', 120, 110, { loadPasses: 2 }),
    shovel(2, 'Shovel 2 (mid)', 120, 220, { loadPasses: 2 }),
    shovel(3, 'Shovel 3 (far)', 120, 330, { loadPasses: 2 }),
  ],
  dumps: [crusher(10, 'Crusher', 560, 220)],
  routes: { '1->10': route(1400, 3), '2->10': route(2400, 4), '3->10': route(3600, 5) },
};
export const C15: CaseSpec = {
  id: 'C15', name: 'Stochastic cycle times (Erlang load + travel noise)', mine: c15Mine,
  fleet: fleet(12, '793F', [1, 2, 3]), shiftSec: SHIFT, noise: { travelCv: 0.35 },
};

// C16 shovel breakdowns: 3-shovel asymmetric geometry; the NEAR shovel (the one a myopic policy
// over-feeds) fails on a Poisson clock (MTBF 1.5 h, MTTR 0.5 h). A myopic policy keeps committing
// trucks to a dying shovel; a look-ahead that samples failures can hedge onto the healthy ones.
const c16Mine: MineSpec = {
  name: 'Breakdown pit (near shovel fails on a Poisson clock)',
  shovels: [
    shovel(1, 'Shovel 1 (near, fails)', 120, 110, { breakdown: { mtbfSec: 5400, mttrSec: 1800 } }),
    shovel(2, 'Shovel 2 (mid)', 120, 220),
    shovel(3, 'Shovel 3 (far)', 120, 330),
  ],
  dumps: [crusher(10, 'Crusher', 560, 220)],
  routes: { '1->10': route(1400, 3), '2->10': route(2400, 4), '3->10': route(3600, 5) },
};
export const C16: CaseSpec = {
  id: 'C16', name: 'Shovel breakdowns (Poisson failure + repair)', mine: c16Mine,
  fleet: fleet(12, '793F', [1, 2, 3]), shiftSec: SHIFT, noise: { travelCv: 0.12 },
};

export const CASES: CaseSpec[] = [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C15, C16];
export const caseById = (id: string): CaseSpec => CASES.find((c) => c.id === id) ?? C01;
