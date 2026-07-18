// Contract 1 (client-side) for real cycle logs, `dispatchlab.cyclelog/v1`. The bring-your-own-shift gate.
// Validates event rows (t, truck_id, shovel_id, event, payload_t), REJECTS structural violations with a reason
// (never silently coerces), FLAGS plausible-but-suspicious rows, and DERIVES the RealSample: rosters, observed
// shift, a synthesized schematic layout (real logs carry no coordinates, labelled as such) and the empirical
// block (per-shovel load means, travel medians, payload stats) that replaces the authored scenario knobs.
// Mirrored offline in data-pipeline/dlab/io (the same artifacts are gated when baked).
import { type MineSpec, type ShovelSpec, type DumpSpec } from '../sim/types';

export type CycleEvent = 'load' | 'haul' | 'dump' | 'return';
export interface CycleRow { t: number; truck: number; node: number; event: CycleEvent; payloadT: number; }

export interface GeologyFace {
  shovelId: number; bench: number; grade: number; oreFraction: number; levelTonnes: number;
}
export interface Geology {
  engine: string;                 // "oreblocks"
  archetype: string;              // porphyry | vein | layered | core_halo
  cutoffGrade: number;            // economic cutoff (mass fraction)
  stampedPitValue: number;        // the exact ultimate-pit value the deposit was solved to
  gradeUnit: string;
  faces: GeologyFace[];           // per-shovel face stamp (grade/bench/ore-fraction at its bench)
  note: string;
}

export interface Provenance {
  source: string;                 // e.g. "OpenMines (MIT), Huolinhe-desensitized config"
  license: string;                // e.g. "MIT" | "CC BY 4.0"
  kind: 'real-field-log' | 'structure-real';
  caveats: string;                // the honest label shown in the App
  geology?: Geology;              // #50: oreblocks grade grounding (open-pit samples only)
}

export interface EmpiricalBlock {
  loadMeanSecByShovel: Record<number, number>;
  dumpMeanSec: number;
  fullTravelMedianSec: Record<string, number>;   // `${shovel}->${dump}` observed loaded travel
  emptyTravelMedianSec: Record<string, number>;
  payloadMeanT: number;
  matchFactor: number;
}

export interface RealSample {
  id: string; name: string;
  provenance: Provenance;
  rows: CycleRow[];               // time-sorted, validated
  trucks: number[];
  shovels: number[];
  dumps: number[];
  shiftSec: number;
  mine: MineSpec;                 // synthesized schematic layout (labelled representational)
  empirical: EmpiricalBlock;
}

export interface IngestReport {
  ok: boolean;
  sample?: RealSample;
  rejected: { row: number; reason: string }[];
  flags: string[];
}

const EVENTS: CycleEvent[] = ['load', 'haul', 'dump', 'return'];
// legal state machine per truck: load -> haul -> dump -> return -> load …
const NEXT: Record<CycleEvent, CycleEvent> = { load: 'haul', haul: 'dump', dump: 'return', return: 'load' };
const PAYLOAD_MAX_T = 400;        // above any ultra-class truck
const MF_RANGE: [number, number] = [0.4, 2.5];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Parse + validate raw rows (already split into fields, e.g. from CSV) against cyclelog/v1. */
export function ingestCycleLog(
  raw: Record<string, string | number>[],
  meta: { id: string; name: string; provenance: Provenance },
): IngestReport {
  const rejected: { row: number; reason: string }[] = [];
  const flags: string[] = [];
  const rows: CycleRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const missing = ['t', 'truck_id', 'shovel_id', 'event', 'payload_t'].filter((c) => r[c] === undefined || r[c] === '');
    if (missing.length) { rejected.push({ row: i, reason: `missing: ${missing.join(',')}` }); continue; }
    const t = Number(r.t), truck = Number(r.truck_id), node = Number(r.shovel_id), payloadT = Number(r.payload_t);
    const event = String(r.event) as CycleEvent;
    if (!Number.isFinite(t) || !Number.isFinite(truck) || !Number.isFinite(node) || !Number.isFinite(payloadT)) {
      rejected.push({ row: i, reason: 'non-numeric t/truck_id/shovel_id/payload_t' }); continue;
    }
    if (!EVENTS.includes(event)) { rejected.push({ row: i, reason: `unknown event '${event}'` }); continue; }
    if (payloadT < 0 || payloadT > PAYLOAD_MAX_T) { rejected.push({ row: i, reason: `payload_t ${payloadT} out of [0,${PAYLOAD_MAX_T}]` }); continue; }
    rows.push({ t, truck, node, event, payloadT });
  }

  // per-truck monotonic time + legal transitions (REJECT the whole sample on a broken machine, it is not a log)
  const byTruck = new Map<number, CycleRow[]>();
  for (const r of rows) { const a = byTruck.get(r.truck) ?? []; a.push(r); byTruck.set(r.truck, a); }
  for (const [truck, list] of byTruck) {
    list.sort((a, b) => a.t - b.t);
    for (let i = 1; i < list.length; i++) {
      if (list[i].t < list[i - 1].t) return { ok: false, rejected: [...rejected, { row: -1, reason: `truck ${truck}: non-monotonic timestamps` }], flags };
      if (NEXT[list[i - 1].event] !== list[i].event) {
        return { ok: false, rejected: [...rejected, { row: -1, reason: `truck ${truck}: illegal ${list[i - 1].event}->${list[i].event} at t=${list[i].t}` }], flags };
      }
    }
  }
  if (rows.length < 8 || byTruck.size < 1) return { ok: false, rejected: [...rejected, { row: -1, reason: 'too few valid rows for a shift' }], flags };

  rows.sort((a, b) => a.t - b.t);
  const t0 = rows[0].t;
  for (const r of rows) r.t -= t0;                      // normalise to shift start
  const shiftSec = rows[rows.length - 1].t;

  // rosters: shovels = nodes seen on 'load'; dumps = nodes seen on 'dump'
  const shovels = [...new Set(rows.filter((r) => r.event === 'load').map((r) => r.node))].sort((a, b) => a - b);
  const dumps = [...new Set(rows.filter((r) => r.event === 'dump').map((r) => r.node))].sort((a, b) => a - b);
  const trucks = [...byTruck.keys()].sort((a, b) => a - b);
  if (!shovels.length || !dumps.length) return { ok: false, rejected: [...rejected, { row: -1, reason: 'no load or no dump events' }], flags };
  if (shovels.some((s) => dumps.includes(s))) flags.push('a node appears as both shovel and dump, check ids');
  if (shovels.length < 2) flags.push('single-shovel sample: dispatch policies have no choice to make');

  // empirical block, measured, replaces the authored scenario knobs
  const loadDur: Record<number, number[]> = {}; const dumpDur: number[] = [];
  const fullTravel: Record<string, number[]> = {}; const emptyTravel: Record<string, number[]> = {};
  const payloads: number[] = [];
  for (const [, list] of byTruck) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      const dt = cur.t - prev.t;
      if (prev.event === 'load' && cur.event === 'haul') (loadDur[prev.node] ??= []).push(dt);
      if (prev.event === 'haul' && cur.event === 'dump') (fullTravel[`${prev.node}->${cur.node}`] ??= []).push(dt);
      if (prev.event === 'dump' && cur.event === 'return') dumpDur.push(dt);
      if (prev.event === 'return' && cur.event === 'load') (emptyTravel[`${prev.node}->${cur.node}`] ??= []).push(dt);
      if (cur.event === 'dump') payloads.push(cur.payloadT);
    }
  }
  const loadMeanSecByShovel: Record<number, number> = {};
  for (const s of shovels) loadMeanSecByShovel[s] = median(loadDur[s] ?? []) || 150;
  const meanLoad = median(Object.values(loadMeanSecByShovel));
  const meanCycle = median(
    [...byTruck.values()].flatMap((list) => {
      const loads = list.filter((r) => r.event === 'load');
      return loads.slice(1).map((l, i) => l.t - loads[i].t);
    }),
  );
  // classic MF = (nTrucks × loader cycle) / (nLoaders × truck cycle)
  const matchFactor = meanCycle > 0 && shovels.length > 0 ? (trucks.length * meanLoad) / (shovels.length * meanCycle) : 0;
  if (matchFactor && (matchFactor < MF_RANGE[0] || matchFactor > MF_RANGE[1])) flags.push(`empirical MF ${matchFactor.toFixed(2)} outside [${MF_RANGE[0]},${MF_RANGE[1]}]`);

  const empirical: EmpiricalBlock = {
    loadMeanSecByShovel,
    dumpMeanSec: median(dumpDur) || 60,
    fullTravelMedianSec: Object.fromEntries(Object.entries(fullTravel).map(([k, v]) => [k, median(v)])),
    emptyTravelMedianSec: Object.fromEntries(Object.entries(emptyTravel).map(([k, v]) => [k, median(v)])),
    payloadMeanT: payloads.length ? payloads.reduce((a, b) => a + b, 0) / payloads.length : 0,
    matchFactor,
  };

  // synthesized schematic layout (real logs carry no coordinates; labelled representational in the UI)
  const shovelSpecs: ShovelSpec[] = shovels.map((id, i) => ({
    id, name: `Shovel ${id}`, pos: { x: 120, y: 120 + i * 160 },
    loadMeanSec: loadMeanSecByShovel[id], loadPasses: 4, spotMeanSec: 0, faceType: 'ore', grade: 0,
  }));
  const dumpSpecs: DumpSpec[] = dumps.map((id, i) => ({
    id, name: `Dump ${id}`, pos: { x: 560, y: 160 + i * 160 },
    kind: 'crusher', dumpMeanSec: empirical.dumpMeanSec, accepts: ['ore'],
  }));
  const routes: MineSpec['routes'] = {};
  for (const s of shovels) for (const d of dumps) {
    const med = empirical.fullTravelMedianSec[`${s}->${d}`];
    if (med) routes[`${s}->${d}`] = { distM: Math.max(200, med * 8), gradePct: 0, rrPct: 3 }; // repr. distance from time
  }
  const mine: MineSpec = { name: `${meta.name} (measured)`, shovels: shovelSpecs, dumps: dumpSpecs, routes };

  return {
    ok: true, rejected, flags,
    sample: { id: meta.id, name: meta.name, provenance: meta.provenance, rows, trucks, shovels, dumps, shiftSec, mine, empirical },
  };
}

/** Parse a cyclelog CSV (header: t,truck_id,shovel_id,event,payload_t) into raw rows. */
export function parseCycleCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).filter((l) => l.trim()).map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}
