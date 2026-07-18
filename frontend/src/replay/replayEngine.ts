// The REPLAY engine (#15): folds a validated real cycle log (RealSample) into the exact SimResult shape the
// whole App already consumes (legs for PitMap/Pit3D, ShovelKpi, crusherFeed, waits, MF), so every tab renders
// a measured shift with zero changes to the DES (des.ts/model.ts untouched; they generate, this reads).
//
// Event semantics (cyclelog/v1): each event marks the start of its phase,
//   load@t  -> loading at the shovel     [load, haul)   = atShovel (serving)
//   haul@t  -> loaded travel             [haul, dump)   = haulFull shovel->dump
//   dump@t  -> dumping                   [dump, return) = atDump
//   return@t-> empty travel + queue      [return, load')= haulEmpty + queue at the next shovel
// The return->load' gap mixes empty travel with queueing; we split it with a per-route BASE travel = the p10
// of that route's observed gaps (documented estimate: near-minimum gap ~ uncontested travel). Queue wait is the
// remainder, an honest, stated approximation for a 4-event log.
import { type Leg, type ShovelKpi, type SimResult } from '../sim/types';
import { type CycleRow, type RealSample } from './ingest';

export interface RealDecision { t: number; truck: number; fromDump: number; chosen: number; options: number[]; }

export interface ReplayOutput { result: SimResult; decisions: RealDecision[]; }

function p10(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.floor(s.length * 0.1))];
}

export function replayCycleLog(sample: RealSample): ReplayOutput {
  const byTruck = new Map<number, CycleRow[]>();
  for (const r of sample.rows) { const a = byTruck.get(r.truck) ?? []; a.push(r); byTruck.set(r.truck, a); }

  // per-route base empty travel (p10 of return->load gaps)
  const emptyGaps: Record<string, number[]> = {};
  for (const [, list] of byTruck) {
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].event === 'return' && list[i].event === 'load') {
        (emptyGaps[`${list[i - 1].node}->${list[i].node}`] ??= []).push(list[i].t - list[i - 1].t);
      }
    }
  }
  const baseEmpty: Record<string, number> = Object.fromEntries(Object.entries(emptyGaps).map(([k, v]) => [k, p10(v)]));

  const pos = (nodeId: number, isShovel: boolean) => {
    const n = isShovel ? sample.mine.shovels.find((s) => s.id === nodeId) : sample.mine.dumps.find((d) => d.id === nodeId);
    return n?.pos ?? { x: 0, y: 0 };
  };

  const legs: Leg[] = [];
  const kpi = new Map<number, ShovelKpi>();
  for (const s of sample.shovels) kpi.set(s, { id: s, name: `Shovel ${s}`, served: 0, queueWaitSec: 0, busySec: 0, idleSec: 0, util: 0 });
  const dumpEvents: { t: number; payloadT: number }[] = [];   // collected globally, accumulated AFTER sorting by t
  const decisions: RealDecision[] = [];
  let tonnes = 0, truckWaitSec = 0;

  for (const [truck, list] of byTruck) {
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i], nxt = list[i + 1];
      const t0 = cur.t, t1 = nxt.t;
      if (cur.event === 'load' && nxt.event === 'haul') {
        const p = pos(cur.node, true);
        legs.push({ truck, x0: p.x, y0: p.y, x1: p.x, y1: p.y, t0, t1, state: 'atShovel', node: cur.node });
        const k = kpi.get(cur.node); if (k) { k.served++; k.busySec += t1 - t0; }
      } else if (cur.event === 'haul' && nxt.event === 'dump') {
        const a = pos(cur.node, true), b = pos(nxt.node, false);
        legs.push({ truck, x0: a.x, y0: a.y, x1: b.x, y1: b.y, t0, t1, state: 'haulFull', node: nxt.node });
      } else if (cur.event === 'dump' && nxt.event === 'return') {
        const p = pos(cur.node, false);
        legs.push({ truck, x0: p.x, y0: p.y, x1: p.x, y1: p.y, t0, t1, state: 'atDump', node: cur.node });
        tonnes += cur.payloadT;
        dumpEvents.push({ t: t1, payloadT: cur.payloadT });
      } else if (cur.event === 'return' && nxt.event === 'load') {
        const a = pos(cur.node, false), b = pos(nxt.node, true);
        const base = baseEmpty[`${cur.node}->${nxt.node}`] || (t1 - t0);
        const tArr = Math.min(t1, t0 + base);
        legs.push({ truck, x0: a.x, y0: a.y, x1: b.x, y1: b.y, t0, t1: tArr, state: 'haulEmpty', node: nxt.node });
        if (t1 > tArr) {   // queue at the shovel (the measured remainder)
          legs.push({ truck, x0: b.x, y0: b.y, x1: b.x, y1: b.y, t0: tArr, t1, state: 'atShovel', node: nxt.node });
          const wait = t1 - tArr;
          truckWaitSec += wait;
          const k = kpi.get(nxt.node); if (k) k.queueWaitSec += wait;
        }
        // the real dispatcher's decision at this dump-complete: it sent this truck to nxt.node
        decisions.push({ t: t0, truck, fromDump: cur.node, chosen: nxt.node, options: sample.shovels });
      }
    }
  }

  for (const k of kpi.values()) { k.idleSec = Math.max(0, sample.shiftSec - k.busySec); k.util = sample.shiftSec > 0 ? k.busySec / sample.shiftSec : 0; }
  const shovels = [...kpi.values()].sort((a, b) => a.id - b.id);
  const meanShovelUtil = shovels.length ? shovels.reduce((a, s) => a + s.util, 0) / shovels.length : 0;
  dumpEvents.sort((a, b) => a.t - b.t);
  const feed: { t: number; tonnes: number }[] = [{ t: 0, tonnes: 0 }];
  let acc = 0;
  for (const d of dumpEvents) { acc += d.payloadT; feed.push({ t: d.t, tonnes: acc }); }

  const result: SimResult = {
    caseId: sample.id, policy: 'measured (real dispatcher)', seed: 0, shiftSec: sample.shiftSec,
    tonnes, truckWaitSec, shovels, meanShovelUtil,
    crusherFeed: feed, matchFactor: sample.empirical.matchFactor,
    trace: legs.sort((a, b) => a.t0 - b.t0),
  };
  return { result, decisions };
}
