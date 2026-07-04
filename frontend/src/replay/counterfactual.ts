// COUNTERFACTUAL dispatch analysis (#18): at every REAL dump-complete in a measured shift, reconstruct the
// dispatch state the real dispatcher faced (from the log itself) and re-decide it under each policy, "would
// this policy have sent the truck where the real dispatcher did?" The App reports per-policy AGREEMENT on the
// real decision points (honest: decision-point agreement, NOT tonnes, counterfactual tonnes need a calibrated
// re-simulation and live in Benchmark, #19).
//
// State reconstruction (all from the log, same estimates as the replay engine, stated in the UI):
//   loading  , a truck has load@tL <= t < haul@tH at the shovel (freeInSec = tH - t, the measured remainder)
//   queueLen , trucks arrived (return + p10 base travel) but not yet loading there
//   inbound  , trucks in empty travel toward the shovel (return <= t < arrival estimate)
//   loadMeanSec, the shovel's measured median; travelEmptySec, the measured route median (p10 fallback)
import { type DispatchState, type ShovelView } from '../sim/types';
import { type PolicyDef } from '../policies/heuristics';
import { type CycleRow, type RealSample } from './ingest';

export interface CfDecision {
  t: number;
  truck: number;
  fromDump: number;
  chosen: number;              // the REAL dispatcher's choice (next load shovel)
  state: DispatchState;        // reconstructed decision state (policies + ONNX features run on this)
}

function p10(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.floor(xs.length * 0.1))];
}

export function reconstructDecisions(sample: RealSample): CfDecision[] {
  const byTruck = new Map<number, CycleRow[]>();
  for (const r of sample.rows) { const a = byTruck.get(r.truck) ?? []; a.push(r); byTruck.set(r.truck, a); }

  // per-route base empty travel (same estimate the replay engine uses)
  const emptyGaps: Record<string, number[]> = {};
  for (const [, list] of byTruck) {
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].event === 'return' && list[i].event === 'load') {
        (emptyGaps[`${list[i - 1].node}->${list[i].node}`] ??= []).push(list[i].t - list[i - 1].t);
      }
    }
  }
  const baseEmpty: Record<string, number> = Object.fromEntries(Object.entries(emptyGaps).map(([k, v]) => [k, p10(v)]));
  const medEmpty: Record<string, number> = Object.fromEntries(
    Object.entries(emptyGaps).map(([k, v]) => { const s = [...v].sort((a, b) => a - b); return [k, s[Math.floor(s.length / 2)]]; }),
  );
  const allMed = Object.values(medEmpty);
  const fallbackTravel = allMed.length ? allMed.reduce((a, b) => a + b, 0) / allMed.length : 300;

  // per-truck interval tables for the state queries
  interface Serve { shovel: number; t0: number; t1: number; }        // load..haul (loading)
  interface Inb { shovel: number; t0: number; t1: number; }          // return..arrival (empty travel)
  interface Queue { shovel: number; t0: number; t1: number; }        // arrival..load (queued)
  const serving: Serve[] = [], inbound: Inb[] = [], queued: Queue[] = [];
  const firstLoad: Record<number, number> = {};
  for (const [truck, list] of byTruck) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      if (prev.event === 'load' && cur.event === 'haul') {
        serving.push({ shovel: prev.node, t0: prev.t, t1: cur.t });
        if (firstLoad[truck] === undefined) firstLoad[truck] = prev.node;
      }
      if (prev.event === 'return' && cur.event === 'load') {
        const base = baseEmpty[`${prev.node}->${cur.node}`] || (cur.t - prev.t);
        const tArr = Math.min(cur.t, prev.t + base);
        inbound.push({ shovel: cur.node, t0: prev.t, t1: tArr });
        if (cur.t > tArr) queued.push({ shovel: cur.node, t0: tArr, t1: cur.t });
      }
    }
  }

  const decisions: CfDecision[] = [];
  for (const [truck, list] of byTruck) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      if (prev.event !== 'return' || cur.event !== 'load') continue;
      const t = prev.t, fromDump = prev.node, chosen = cur.node;
      const shovels: ShovelView[] = sample.shovels.map((sid) => {
        const spec = sample.mine.shovels.find((s) => s.id === sid)!;
        const serve = serving.find((x) => x.shovel === sid && x.t0 <= t && t < x.t1);
        return {
          id: sid, spec,
          queueLen: queued.filter((x) => x.shovel === sid && x.t0 <= t && t < x.t1).length,
          loading: !!serve,
          inbound: inbound.filter((x) => x.shovel === sid && x.t0 <= t && t < x.t1 && !(x.t0 === t && cur.node === sid)).length,
          freeInSec: serve ? serve.t1 - t : 0,
          loadMeanSec: sample.empirical.loadMeanSecByShovel[sid] ?? 150,
        };
      });
      const state: DispatchState = {
        now: t,
        truck: { id: truck, spec: { model: 'measured', payloadT: sample.empirical.payloadMeanT, tareT: 0, powerKW: 0, maxSpeedKmh: 0 }, startShovel: firstLoad[truck] ?? sample.shovels[0] },
        atDumpId: fromDump,
        shovels,
        travelEmptySec: (to: number) => medEmpty[`${fromDump}->${to}`] ?? fallbackTravel,
      };
      decisions.push({ t, truck, fromDump, chosen, state });
    }
  }
  decisions.sort((a, b) => a.t - b.t);
  return decisions;
}

export interface AgreementRow { id: string; label: string; agree: number; n: number; pct: number; }

/** Per-policy agreement with the real dispatcher over the reconstructed decision points. */
export function agreement(decisions: CfDecision[], policies: PolicyDef[], es: boolean): AgreementRow[] {
  return policies.map((p) => {
    let agree = 0;
    for (const d of decisions) {
      try { if (p.fn(d.state) === d.chosen) agree++; } catch { /* a policy that cannot run on this state counts as disagree */ }
    }
    const n = decisions.length || 1;
    return { id: p.id, label: (es ? p.es : p.en).split(' (')[0], agree, n: decisions.length, pct: (agree / n) * 100 };
  }).sort((a, b) => b.pct - a.pct);
}
