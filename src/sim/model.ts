// The truck-shovel cycle as a deterministic discrete-event model. Each truck loops:
//   queue@shovel → spot → load (release shovel) → haul full → queue@dump → dump (release dump)
//   → DISPATCH decision (policy picks next shovel) → haul empty → queue@shovel …
// Shovels and dumps are single-server FIFO resources. The dispatch policy is the only pluggable decision and
// fires exactly at dump-complete. KPIs (tonnes, per-shovel queue/idle/util, truck wait, crusher feed) are
// accumulated as the events fire. Determinism comes from des.ts (integer-tick clock + (time,priority,seq)).
import { Sim } from './des';
import { Rng } from '../lib/rng';
import { travelTimeSec } from './kinematics';
import { analyticalMatchFactor } from './matchfactor';
import { type CaseSpec, type Policy, type SimResult, type ShovelView, type DispatchState, type MineSpec, type Leg } from './types';

interface ShovelRT {
  id: number; spec: CaseSpec['mine']['shovels'][number];
  queue: number[];           // truck ids waiting
  loading: boolean;
  serviceEndsAt: number;     // sim seconds the current load completes (if loading)
  inbound: number;
  served: number; queueWaitSec: number; busySec: number; idleSec: number;
  lastChange: number;        // last time busy/idle state changed
}

const rk = (s: number, d: number) => `${s}->${d}`;

/** Pick the dump a shovel's material goes to (first dump that accepts the face type). */
function dumpFor(mine: MineSpec, faceType: 'ore' | 'waste'): number {
  const d = mine.dumps.find((x) => x.accepts.includes(faceType)) ?? mine.dumps[0];
  return d.id;
}

export interface RunOpts { deterministic?: boolean; trace?: boolean; onDecision?: (state: DispatchState, chosen: number) => void }

export function runSimulation(c: CaseSpec, policy: Policy, seed: number, opts: RunOpts = {}): SimResult {
  const sim = new Sim();
  const rng = new Rng(seed);
  const det = !!opts.deterministic;
  const trace: Leg[] | undefined = opts.trace ? [] : undefined;
  const posOf = (kind: 'shovel' | 'dump', id: number) => {
    const n = kind === 'shovel' ? mine.shovels.find((x) => x.id === id) : mine.dumps.find((x) => x.id === id);
    return n ? n.pos : { x: 0, y: 0 };
  };
  const move = (truck: number, from: { x: number; y: number }, to: { x: number; y: number }, t0: number, t1: number, state: Leg['state'], node: number) => {
    if (trace) trace.push({ truck, x0: from.x, y0: from.y, x1: to.x, y1: to.y, t0, t1, state, node });
  };
  const stay = (truck: number, at: { x: number; y: number }, t0: number, t1: number, state: Leg['state'], node: number) => {
    if (trace && t1 > t0) trace.push({ truck, x0: at.x, y0: at.y, x1: at.x, y1: at.y, t0, t1, state, node });
  };
  const loadS = rng.stream('load'), travelS = rng.stream('travel'), dumpS = rng.stream('dump');
  const tmul = () => (det ? 1 : travelS.lognormal(1, 0.08));
  const mine = c.mine;

  const sh = new Map<number, ShovelRT>();
  for (const s of mine.shovels) sh.set(s.id, { id: s.id, spec: s, queue: [], loading: false, serviceEndsAt: 0, inbound: 0, served: 0, queueWaitSec: 0, busySec: 0, idleSec: 0, lastChange: 0 });
  const dumpBusy = new Map<number, boolean>(), dumpQ = new Map<number, number[]>();
  for (const d of mine.dumps) { dumpBusy.set(d.id, false); dumpQ.set(d.id, []); }

  const truckArr = new Map<number, number>();    // truck id → time it joined its current shovel queue
  let tonnes = 0, truckWaitSec = 0;
  const crusher = mine.dumps.find((d) => d.kind === 'crusher') ?? mine.dumps[0];
  const crusherFeed: { t: number; tonnes: number }[] = [{ t: 0, tonnes: 0 }];
  let crusherTonnes = 0;

  const truckById = new Map(c.fleet.trucks.map((t) => [t.id, t]));
  const route = (s: number, d: number) => mine.routes[rk(s, d)] ?? { distM: 1500, gradePct: 0, rrPct: 3 };

  // ---- shovel busy/idle accounting ----
  const markShovel = (s: ShovelRT, busy: boolean, now: number) => {
    const dt = now - s.lastChange;
    if (s.loading) s.busySec += dt; else s.idleSec += dt;
    s.lastChange = now; s.loading = busy;
  };

  const buildState = (truckId: number, atDumpId: number | null, now: number): DispatchState => {
    const truck = truckById.get(truckId)!;
    const shovels: ShovelView[] = mine.shovels.map((spec) => {
      const r = sh.get(spec.id)!;
      const freeInSec = r.loading ? Math.max(0, r.serviceEndsAt - now) : 0;
      return { id: spec.id, spec, queueLen: r.queue.length, loading: r.loading, inbound: r.inbound, freeInSec, loadMeanSec: spec.loadMeanSec };
    });
    const fromDump = atDumpId ?? crusher.id;
    const travelEmptySec = (toShovelId: number) => {
      const rt = route(toShovelId, fromDump);
      return travelTimeSec(rt.distM, -rt.gradePct, rt.rrPct, truck.spec, false);
    };
    return { now, truck, atDumpId, shovels, travelEmptySec };
  };

  // ---- start a shovel service if idle + queue non-empty ----
  const tryStartShovel = (s: ShovelRT) => {
    if (s.loading || s.queue.length === 0) return;
    const now = sim.now();
    const truckId = s.queue.shift()!;
    const wait = now - (truckArr.get(truckId) ?? now);
    s.queueWaitSec += wait; truckWaitSec += wait;   // shovel-queue wait counts toward total truck wait
    markShovel(s, true, now);
    const spot = s.spec.spotMeanSec > 0 ? (det ? s.spec.spotMeanSec : loadS.lognormal(s.spec.spotMeanSec, 0.3)) : 0;
    const load = det ? s.spec.loadMeanSec : loadS.erlang(s.spec.loadPasses, s.spec.loadMeanSec);
    const dur = spot + load;
    s.serviceEndsAt = now + dur;
    sim.schedule(dur, () => onLoaded(truckId, s), 0);
  };

  const onLoaded = (truckId: number, s: ShovelRT) => {
    const now = sim.now();
    const arr = truckArr.get(truckId) ?? now;
    markShovel(s, false, now); s.served++;
    tryStartShovel(s);
    const truck = truckById.get(truckId)!;
    const dumpId = dumpFor(mine, s.spec.faceType);
    const rt = route(s.id, dumpId);
    const tt = travelTimeSec(rt.distM, rt.gradePct, rt.rrPct, truck.spec, true) * tmul();
    const sp = posOf('shovel', s.id), dp = posOf('dump', dumpId);
    stay(truckId, sp, arr, now, 'atShovel', s.id);
    move(truckId, sp, dp, now, now + tt, 'haulFull', dumpId);
    sim.schedule(tt, () => arriveDump(truckId, dumpId), 1);
  };

  const arriveDump = (truckId: number, dumpId: number) => {
    const q = dumpQ.get(dumpId)!;
    truckArr.set(truckId, sim.now());
    q.push(truckId);
    tryStartDump(dumpId);
  };

  const tryStartDump = (dumpId: number) => {
    if (dumpBusy.get(dumpId)) return;
    const q = dumpQ.get(dumpId)!; if (q.length === 0) return;
    const truckId = q.shift()!;
    truckWaitSec += sim.now() - (truckArr.get(truckId) ?? sim.now());
    dumpBusy.set(dumpId, true);
    const d = mine.dumps.find((x) => x.id === dumpId)!;
    const dur = det ? d.dumpMeanSec : dumpS.lognormal(d.dumpMeanSec, 0.25);
    sim.schedule(dur, () => onDumped(truckId, dumpId), 0);
  };

  const onDumped = (truckId: number, dumpId: number) => {
    const now = sim.now();
    const arr = truckArr.get(truckId) ?? now;
    const truck = truckById.get(truckId)!;
    tonnes += truck.spec.payloadT;
    if (dumpId === crusher.id) { crusherTonnes += truck.spec.payloadT; crusherFeed.push({ t: now, tonnes: crusherTonnes }); }
    dumpBusy.set(dumpId, false);
    tryStartDump(dumpId);
    // DISPATCH decision
    const state = buildState(truckId, dumpId, now);
    const chosen = policy(state);
    opts.onDecision?.(state, chosen);   // log (state, action) for the offline-RL / imitation dataset
    const target = sh.get(chosen) ?? sh.get(mine.shovels[0].id)!;
    target.inbound++;
    const rt = route(target.id, dumpId);
    const tt = travelTimeSec(rt.distM, -rt.gradePct, rt.rrPct, truck.spec, false) * tmul();
    const dp = posOf('dump', dumpId), sp = posOf('shovel', target.id);
    stay(truckId, dp, arr, now, 'atDump', dumpId);
    move(truckId, dp, sp, now, now + tt, 'haulEmpty', target.id);
    sim.schedule(tt, () => arriveShovel(truckId, target.id), 1);
  };

  const arriveShovel = (truckId: number, shovelId: number) => {
    const s = sh.get(shovelId)!;
    s.inbound = Math.max(0, s.inbound - 1);
    truckArr.set(truckId, sim.now());
    s.queue.push(truckId);
    tryStartShovel(s);
  };

  // ---- initial dispatch: each truck starts heading to its start shovel ----
  for (const t of c.fleet.trucks) {
    const s = sh.get(t.startShovel) ?? sh.get(mine.shovels[0].id)!;
    s.inbound++;
    const stagger = det ? 0 : travelS.range(0, 30);   // small spread so they don't all arrive at tick 0
    sim.schedule(stagger, () => arriveShovel(t.id, s.id), 1);
  }

  sim.run(c.shiftSec);

  // finalize shovel accounting at shift end
  const end = c.shiftSec;
  const shovels = mine.shovels.map((spec) => {
    const r = sh.get(spec.id)!;
    const dt = end - r.lastChange;
    if (r.loading) r.busySec += dt; else r.idleSec += dt;
    const util = end > 0 ? r.busySec / end : 0;
    return { id: spec.id, name: spec.name, served: r.served, queueWaitSec: r.queueWaitSec, busySec: r.busySec, idleSec: r.idleSec, util };
  });
  const meanShovelUtil = shovels.reduce((a, b) => a + b.util, 0) / Math.max(1, shovels.length);

  return {
    caseId: c.id, policy: policy.name || 'policy', seed, shiftSec: c.shiftSec,
    tonnes, truckWaitSec, shovels, meanShovelUtil, crusherFeed,
    matchFactor: analyticalMatchFactor(c),
    trace,
  };
}
