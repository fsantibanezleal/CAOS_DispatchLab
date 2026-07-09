// Correctness-anchor FIXTURES (#67 round 2). The user corpus is now all real multi-source cases (no 1-source
// tiles), so the determinism anchors live here as test-only fixtures instead of user tiles:
//   * ORACLE_1x1  a single truck / single shovel / single crusher pit whose deterministic throughput equals
//                 the closed form floor((shift - t1)/cycle + 1) * payload EXACTLY.
//   * TIE_SYM     a perfectly symmetric multi-shovel pit, every policy (and the rollout vs its base) ties.
//   * POS_ASYM    a strongly asymmetric multi-shovel pit, the look-ahead rollout beats its myopic base.
// They are LEGACY (no portal) single-material pits, so the closed-form / tie behaviour is exact and stable
// and the material-lane empty-return (all-ore => the lane is every shovel) is a no-op on them.
import { TRUCKS } from '../src/sim/kinematics';
import { type CaseSpec, type MineSpec, type Route } from '../src/sim/types';

const SHIFT = 28800;
const route = (distM: number, gradePct: number, rrPct = 3): Route => ({ distM, gradePct, rrPct });
const fleet = (n: number, model: keyof typeof TRUCKS, shovelIds: number[]) => ({
  trucks: Array.from({ length: n }, (_, i) => ({ id: i + 1, spec: TRUCKS[model], startShovel: shovelIds[i % shovelIds.length] })),
});

// ---- 1x1 oracle: throughput = floor(.) * payload EXACTLY (spot 0, flat road) ----
const oracleMine: MineSpec = {
  name: 'Oracle 1x1',
  shovels: [{ id: 1, name: 'Shovel 1', pos: { x: 150, y: 200 }, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 0, faceType: 'ore', grade: 0.8 }],
  dumps: [{ id: 10, name: 'Crusher', pos: { x: 500, y: 200 }, kind: 'crusher', dumpMeanSec: 60, accepts: ['ore'] }],
  routes: { '1->10': route(1800, 0, 2) },
};
export const ORACLE_1x1: CaseSpec = { id: 'FX_ORACLE', name: 'Fixture: 1x1 oracle', mine: oracleMine, fleet: fleet(1, '793F', [1]), shiftSec: SHIFT };

// ---- symmetric tie control: 4 identical shovels + one crusher, all roads equal ----
const symMine: MineSpec = {
  name: 'Four-shovel symmetric pit',
  shovels: [1, 2, 3, 4].map((id) => ({ id, name: `Shovel ${id}`, pos: { x: 120, y: 90 + (id - 1) * 100 }, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 30, faceType: 'ore' as const, grade: 0.8 })),
  dumps: [{ id: 10, name: 'Crusher', pos: { x: 580, y: 240 }, kind: 'crusher', dumpMeanSec: 60, accepts: ['ore'] }],
  routes: { '1->10': route(2200, 4), '2->10': route(2200, 4), '3->10': route(2200, 4), '4->10': route(2200, 4) },
};
export const TIE_SYM: CaseSpec = { id: 'FX_TIE', name: 'Fixture: symmetric tie control', mine: symMine, fleet: fleet(16, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };

// ---- asymmetric positive control: near/mid/far/far-steep shovels, a 2-bay plant (roads bind) ----
const asymMine: MineSpec = {
  name: 'Four-shovel asymmetric pit',
  shovels: [
    { id: 1, name: 'Shovel 1 (near)', pos: { x: 150, y: 110 }, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 30, faceType: 'ore', grade: 0.8 },
    { id: 2, name: 'Shovel 2 (mid)', pos: { x: 130, y: 220 }, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 30, faceType: 'ore', grade: 0.8 },
    { id: 3, name: 'Shovel 3 (far)', pos: { x: 120, y: 330 }, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 30, faceType: 'ore', grade: 0.8 },
    { id: 4, name: 'Shovel 4 (far, steep)', pos: { x: 115, y: 430 }, loadMeanSec: 150, loadPasses: 4, spotMeanSec: 30, faceType: 'ore', grade: 0.8 },
  ],
  dumps: [{ id: 10, name: 'Crusher (2 bays)', pos: { x: 590, y: 260 }, kind: 'crusher', dumpMeanSec: 60, accepts: ['ore'], bays: 2 }],
  routes: { '1->10': route(700, 2), '2->10': route(2600, 4), '3->10': route(4200, 5), '4->10': route(5200, 8, 4) },
};
export const POS_ASYM: CaseSpec = { id: 'FX_POS', name: 'Fixture: asymmetric positive control', mine: asymMine, fleet: fleet(12, '793F', [1, 2, 3, 4]), shiftSec: SHIFT };
