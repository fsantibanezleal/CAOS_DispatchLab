// Capacity oracle (#22 P2): a queue-free UPPER BOUND on shift tonnes from the transportation-LP
// relaxation aggregated per resource family, the offline yardstick the Benchmark scores every
// policy against ("% of oracle").
//
//   loads_shovels = Σ_s  1 + shift / (loadMean_s + spot_s)   (nonstop service from t=0)
//   loads_trucks  = Σ_t  1 + shift / minCycle_t              (fastest feasible cycle, zero queueing;
//                                                             the +1 covers the head start, trucks
//                                                             begin AT a shovel, so load k completes
//                                                             no earlier than (k−1)·minCycle)
//   bound_tonnes  = min(loads_shovels, loads_trucks) × payload
//
// Honesty: this is a RELAXATION over the MEAN dynamics, it ignores queueing, interference and
// integrality. It bounds DETERMINISTIC runs exactly (asserted strictly in tests); STOCHASTIC
// runs draw leg/service durations with mean-1 noise, so a lucky seed can graze or slightly
// exceed it (the trivial 1×1 oracle case exists precisely to sit at the bound), the Benchmark
// therefore reports "% of oracle" on medians and tests allow a 2% noise margin per seed. The gap
// between the best policy and the oracle is the price of congestion + myopia, exactly what the
// Benchmark wants to show. (Refs: White & Olson 1986; Alarie & Gamache 2002.)
import { travelTimeSec } from './kinematics';
import { type CaseSpec } from './types';

export interface OracleBound {
  tonnes: number;
  bindingSide: 'shovels' | 'trucks';
  loadsShovels: number;
  loadsTrucks: number;
}

export function capacityOracle(c: CaseSpec): OracleBound {
  const rk = (s: number, d: number) => `${s}->${d}`;
  const dumpsFor = (faceType: 'ore' | 'waste') =>
    c.mine.dumps.filter((d) => d.accepts.includes(faceType));

  const loadsShovels = c.mine.shovels.reduce(
    (acc, s) => acc + 1 + c.shiftSec / (s.loadMeanSec + s.spotMeanSec), 0);

  let loadsTrucks = 0;
  let truckSideTonnes = 0;                                 // exact per truck (heterogeneous fleets)
  let maxPayload = 0;
  for (const t of c.fleet.trucks) {
    // the truck's fastest feasible full cycle: best (shovel, accepting dump) pair, free flow
    let minCycle = Infinity;
    for (const s of c.mine.shovels) {
      for (const d of dumpsFor(s.faceType)) {
        const rt = c.mine.routes[rk(s.id, d.id)];
        if (!rt) continue;
        const full = travelTimeSec(rt.distM, rt.gradePct, rt.rrPct, t.spec, true);
        const empty = travelTimeSec(rt.distM, -rt.gradePct, rt.rrPct, t.spec, false);
        const cycle = s.loadMeanSec + s.spotMeanSec + full + d.dumpMeanSec + empty;
        if (cycle < minCycle) minCycle = cycle;
      }
    }
    if (Number.isFinite(minCycle)) {
      const loads = 1 + c.shiftSec / minCycle;
      loadsTrucks += loads;
      truckSideTonnes += loads * t.spec.payloadT;
    }
    maxPayload = Math.max(maxPayload, t.spec.payloadT);
  }

  const shovelSideTonnes = loadsShovels * maxPayload;      // each service carries <= the biggest bed
  const trucksBind = truckSideTonnes < shovelSideTonnes;
  return {
    tonnes: Math.min(shovelSideTonnes, truckSideTonnes),
    bindingSide: trucksBind ? 'trucks' : 'shovels',
    loadsShovels, loadsTrucks,
  };
}
