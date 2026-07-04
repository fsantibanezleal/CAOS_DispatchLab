// Match factor, the analytical fleet-balance ground truth the simulator is validated against. ONE pinned
// definition is used everywhere (avoiding the text-to-text drift): the truck "demand" rate divided by the
// shovel "service" capacity,
//     MF = (N_trucks · t_load) / (N_shovels · t_cycle),     t_cycle = load + haul-full + dump + haul-empty
// where t_cycle is the ideal loop time EXCLUDING queueing. MF ≈ 1 balanced; > 1 over-trucked (truck queues);
// < 1 under-trucked (shovel idle). The classic formula assumes a homogeneous fleet (Morgan & Peterson,
// commonly attributed); the heterogeneous (mixed-class) correction (Burt & Caccetta 2007,
// doi:10.1080/17480930701388606) is NOT implemented yet (backlog). Here we compute the homogeneous MF with
// a representative truck, approximate for mixed fleets (C11).
import { travelTimeSec } from './kinematics';
import { type CaseSpec, type MineSpec } from './types';

const rk = (s: number, d: number) => `${s}->${d}`;
function dumpId(mine: MineSpec, faceType: 'ore' | 'waste'): number {
  return (mine.dumps.find((x) => x.accepts.includes(faceType)) ?? mine.dumps[0]).id;
}

/** Ideal (no-queue) loop time for a representative truck at one shovel, plus its load time. */
export function shovelCycle(c: CaseSpec, shovelId: number): { tLoad: number; tCycle: number } {
  const mine = c.mine;
  const s = mine.shovels.find((x) => x.id === shovelId)!;
  const truck = c.fleet.trucks[0].spec;
  const d = dumpId(mine, s.faceType);
  const dump = mine.dumps.find((x) => x.id === d)!;
  const rt = mine.routes[rk(s.id, d)] ?? { distM: 1500, gradePct: 0, rrPct: 3 };
  const tLoad = s.spotMeanSec + s.loadMeanSec;
  const haulFull = travelTimeSec(rt.distM, rt.gradePct, rt.rrPct, truck, true);
  const haulEmpty = travelTimeSec(rt.distM, -rt.gradePct, rt.rrPct, truck, false);
  return { tLoad, tCycle: tLoad + haulFull + dump.dumpMeanSec + haulEmpty };
}

export function analyticalMatchFactor(c: CaseSpec, nTrucks = c.fleet.trucks.length): number {
  const mine = c.mine;
  const ns = mine.shovels.length;
  let tl = 0, tc = 0;
  for (const s of mine.shovels) { const r = shovelCycle(c, s.id); tl += r.tLoad; tc += r.tCycle; }
  const tLoadAvg = tl / ns, tCycleAvg = tc / ns;
  return tCycleAvg > 0 ? (nTrucks * tLoadAvg) / (ns * tCycleAvg) : 0;
}
