// Calibrated counterfactual re-simulation (#19): re-run a measured shift under a different
// dispatch policy, with every time component drawn from the sample's OWN empirical distributions
// (per-shovel load medians, per-route full/empty travel, dump mean). This is the estimator the
// Benchmark's "counterfactual tonnes" come from, the missing piece the agreement view (#18)
// honestly declined to fake.
//
// Model (transparent, stated in the UI):
//   truck cycle = emptyTravel(dump→shovel, p10 base = queue-free) → FIFO queue at the shovel
//   (capacity 1) → load (per-shovel median) → fullTravel(shovel→dump median) → FIFO dump
//   (capacity 1 per dump) → policy decision (the same DispatchState interface the live policies
//   consume, built from the sim's exact state, no estimation error at decision points).
//   Durations get a small seeded lognormal jitter (cv 0.15) so seed bands are meaningful.
//   Payload = the sample's measured mean. Horizon = the measured shift.
//
// Honesty: this is a policy-effect estimate under the measured-case model, it inherits the
// sample's provenance caveats (domain transfer) and the p10-as-base-travel assumption. It is not
// a re-run of the source generator.
import { type DispatchState, type ShovelView } from '../sim/types';
import { type PolicyDef } from '../policies/heuristics';
import { type CycleRow, type RealSample } from './ingest';

const CV = 0.15;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** lognormal factor with median 1 and small cv, from two uniforms (Box–Muller). */
function jitter(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12), u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(CV * z);
}

function p10(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.floor(xs.length * 0.1))];
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

export interface CfSimResult { tonnes: number; cycles: number; truckWaitSec: number; }

export function cfSimulate(sample: RealSample, policy: PolicyDef['fn'], seed: number): CfSimResult {
  const rng = mulberry32(seed * 2654435761 + 97);
  const emp = sample.empirical;

  // queue-free base empty travel per route (p10 of measured return→load gaps, as in #18)
  const emptyGaps: Record<string, number[]> = {};
  const byTruck = new Map<number, CycleRow[]>();
  for (const r of sample.rows) { const a = byTruck.get(r.truck) ?? []; a.push(r); byTruck.set(r.truck, a); }
  for (const [, list] of byTruck) {
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].event === 'return' && list[i].event === 'load') {
        (emptyGaps[`${list[i - 1].node}->${list[i].node}`] ??= []).push(list[i].t - list[i - 1].t);
      }
    }
  }
  const baseEmpty: Record<string, number> = Object.fromEntries(Object.entries(emptyGaps).map(([k, v]) => [k, p10(v)]));
  const fallbackEmpty = median(Object.values(baseEmpty).filter((x) => x > 0)) || 300;
  const fullMed = emp.fullTravelMedianSec;
  const fallbackFull = median(Object.values(fullMed).filter((x) => x > 0)) || 400;
  const loadOf = (sid: number) => emp.loadMeanSecByShovel[sid] ?? 150;
  const bestDumpOf = (sid: number) => {
    let best = sample.dumps[0], t = Infinity;
    for (const d of sample.dumps) { const v = fullMed[`${sid}->${d}`] ?? Infinity; if (v < t) { t = v; best = d; } }
    return best;
  };

  // ---- event-driven state ----
  interface Truck { id: number; t: number; shovel: number; dump: number; }
  const firstLoad: Record<number, number> = {};
  for (const [truck, list] of byTruck) {
    const l = list.find((r) => r.event === 'load');
    if (l) firstLoad[truck] = l.node;
  }
  const shovelFreeAt: Record<number, number> = Object.fromEntries(sample.shovels.map((s) => [s, 0]));
  const shovelQueue: Record<number, number> = Object.fromEntries(sample.shovels.map((s) => [s, 0]));
  const inboundTo: Record<number, number> = Object.fromEntries(sample.shovels.map((s) => [s, 0]));
  const dumpFreeAt: Record<number, number> = Object.fromEntries(sample.dumps.map((d) => [d, 0]));

  let tonnes = 0, cycles = 0, waitSec = 0;
  // process trucks one leg at a time via a simple min-heap on (t, truckId)
  const heap: Truck[] = sample.trucks.map((id, i) => ({
    id, t: (i * 7) % 60, shovel: firstLoad[id] ?? sample.shovels[0], dump: -1,
  }));
  for (const tr of heap) inboundTo[tr.shovel]++;
  const pop = () => { heap.sort((a, b) => a.t - b.t || a.id - b.id); return heap.shift()!; };

  while (heap.length) {
    const tr = pop();
    if (tr.t >= sample.shiftSec) continue;                       // parked at horizon

    // arrive at shovel: queue (FIFO via freeAt), load, haul, dump, decide, return
    inboundTo[tr.shovel] = Math.max(0, inboundTo[tr.shovel] - 1);
    const startLoad = Math.max(tr.t, shovelFreeAt[tr.shovel]);
    waitSec += startLoad - tr.t;
    shovelQueue[tr.shovel]++;                                    // approximated as time-integral-free count
    const loadS = loadOf(tr.shovel) * jitter(rng);
    shovelFreeAt[tr.shovel] = startLoad + loadS;
    shovelQueue[tr.shovel] = Math.max(0, shovelQueue[tr.shovel] - 1);
    const dump = bestDumpOf(tr.shovel);
    const arriveDump = startLoad + loadS + (fullMed[`${tr.shovel}->${dump}`] ?? fallbackFull) * jitter(rng);
    const startDump = Math.max(arriveDump, dumpFreeAt[dump]);
    waitSec += startDump - arriveDump;
    const dumpS = emp.dumpMeanSec * jitter(rng);
    dumpFreeAt[dump] = startDump + dumpS;
    const tDecision = startDump + dumpS;
    if (tDecision <= sample.shiftSec) { tonnes += emp.payloadMeanT; cycles++; }

    // policy decision on the exact sim state
    const views: ShovelView[] = sample.shovels.map((sid) => {
      const spec = sample.mine.shovels.find((s) => s.id === sid)!;
      const busyFor = Math.max(0, shovelFreeAt[sid] - tDecision);
      return {
        id: sid, spec,
        queueLen: 0,                                             // queue folded into freeInSec (capacity-1 model)
        loading: busyFor > 0,
        inbound: inboundTo[sid],
        freeInSec: busyFor,
        loadMeanSec: loadOf(sid),
      };
    });
    const state: DispatchState = {
      now: tDecision,
      truck: { id: tr.id, spec: { model: 'measured', payloadT: emp.payloadMeanT, tareT: 0, powerKW: 0, maxSpeedKmh: 0 }, startShovel: firstLoad[tr.id] ?? sample.shovels[0] },
      atDumpId: dump,
      shovels: views,
      travelEmptySec: (to: number) => (baseEmpty[`${dump}->${to}`] || fallbackEmpty),
    };
    let next = tr.shovel;
    try { next = policy(state); } catch { /* keep current shovel */ }
    if (!sample.shovels.includes(next)) next = tr.shovel;

    const tArrive = tDecision + (baseEmpty[`${dump}->${next}`] || fallbackEmpty) * jitter(rng);
    inboundTo[next]++;
    heap.push({ id: tr.id, t: tArrive, shovel: next, dump });
  }
  return { tonnes, cycles, truckWaitSec: waitSec };
}
