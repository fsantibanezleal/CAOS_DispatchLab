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

// ---- C12 trivial 1-truck-1-shovel oracle (deterministic; throughput = payload·⌊·⌋ exactly) ----
const c12Mine: MineSpec = {
  name: 'Oracle 1×1', shovels: [shovel(1, 'Shovel 1', 150, 200, { spotMeanSec: 0 })], dumps: [crusher(10, 'Crusher', 500, 200)],
  routes: { '1->10': route(1800, 0, 2) },
};
export const C12: CaseSpec = { id: 'C12', name: '1-truck-1-shovel oracle', mine: c12Mine, fleet: fleet(1, '793F', [1]), shiftSec: SHIFT };

export const CASES: CaseSpec[] = [C01, C02, C05, C12];
export const caseById = (id: string): CaseSpec => CASES.find((c) => c.id === id) ?? C01;
