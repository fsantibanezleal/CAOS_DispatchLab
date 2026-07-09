// The truck-shovel cycle as a deterministic discrete-event model. Each truck loops:
//   queue@shovel → spot → load (release shovel) → haul full → queue@dump → dump (release dump)
//   → DISPATCH decision (policy picks next shovel) → haul empty → queue@shovel …
// Shovels and dumps are single-server FIFO resources. The dispatch policy is the only pluggable decision and
// fires exactly at dump-complete. KPIs (tonnes, per-shovel queue/idle/util, truck wait, crusher feed) are
// accumulated as the events fire. Determinism comes from des.ts (integer-tick clock + (time,priority,seq)).
import { Sim } from './des';
import { Rng } from '../lib/rng';
import { haulTimeSec } from './haul';
import { analyticalMatchFactor } from './matchfactor';
import { feasibleShovels, inBreak, nearestFeasible } from './constraints';
import { type CaseSpec, type Policy, type SimResult, type ShovelView, type DispatchState, type MineSpec, type DumpSpec, type Leg } from './types';

interface ShovelRT {
  id: number; spec: CaseSpec['mine']['shovels'][number];
  queue: number[];           // truck ids waiting
  loading: boolean;
  serviceEndsAt: number;     // sim seconds the current load completes (if loading)
  inbound: number;
  served: number; queueWaitSec: number; busySec: number; idleSec: number;
  lastChange: number;        // last time busy/idle state changed
  down: boolean;             // C16: the shovel is broken down (cannot start a service until repaired)
  repairEndsAt: number;      // sim seconds the current repair completes (if down)
}

const rk = (s: number, d: number) => `${s}->${d}`;

const RECLAIM_DT = 60;   // reclaimer feed step [s], a fixed deterministic grid (no RNG)

/** Nearest dump of a candidate set from a shovel by loaded route distance (tie: lower id). Deterministic. */
function nearestDump(mine: MineSpec, shovelId: number, cand: DumpSpec[]): DumpSpec | undefined {
  let best: DumpSpec | undefined, bestD = Infinity;
  for (const d of cand) {
    const r = mine.routes[rk(shovelId, d.id)];
    if (!r) continue;
    if (r.distM < bestD - 1e-9 || (Math.abs(r.distM - bestD) <= 1e-9 && (!best || d.id < best.id))) { best = d; bestD = r.distM; }
  }
  return best;
}

/** Nearest crusher to a node by planar position (for a stockpile reclaimer's default target; tie: lower id). */
function nearestByPos(from: { x: number; y: number }, cand: DumpSpec[]): number | undefined {
  let best: DumpSpec | undefined, bestD = Infinity;
  for (const d of cand) {
    const dist = Math.hypot(d.pos.x - from.x, d.pos.y - from.y);
    if (dist < bestD - 1e-9 || (Math.abs(dist - bestD) <= 1e-9 && (!best || d.id < best.id))) { best = d; bestD = dist; }
  }
  return best?.id;
}

export interface RunOpts { deterministic?: boolean; trace?: boolean; onDecision?: (state: DispatchState, chosen: number) => void }

export function runSimulation(c: CaseSpec, policy: Policy, seed: number, opts: RunOpts = {}): SimResult {
  const sim = new Sim();
  const rng = new Rng(seed);
  const det = !!opts.deterministic;
  const trace: Leg[] | undefined = opts.trace ? [] : undefined;
  const posOf = (kind: 'shovel' | 'dump', id: number) => {
    const n = kind === 'shovel' ? mine.shovels.find((x) => x.id === id) : mine.dumps.find((x) => x.id === id);
    // HARD dev guard (#67 round 2): a node id that fails to resolve is a BUG, never a silent {0,0} that
    // interpolates a truck to the top-left origin ("disappearing to nothing"). Throw so it can't ship.
    if (!n) throw new Error(`posOf: unresolved ${kind} id=${id} in case ${c.id} (roads/legs must reference real nodes)`);
    return n.pos;
  };
  const move = (truck: number, from: { x: number; y: number }, to: { x: number; y: number }, t0: number, t1: number, state: Leg['state'], node: number, mat?: 'ore' | 'waste') => {
    if (trace) trace.push({ truck, x0: from.x, y0: from.y, x1: to.x, y1: to.y, t0, t1, state, node, mat });
  };
  const stay = (truck: number, at: { x: number; y: number }, t0: number, t1: number, state: Leg['state'], node: number, mat?: 'ore' | 'waste') => {
    if (trace && t1 > t0) trace.push({ truck, x0: at.x, y0: at.y, x1: at.x, y1: at.y, t0, t1, state, node, mat });
  };
  const loadS = rng.stream('load'), travelS = rng.stream('travel'), dumpS = rng.stream('dump'), breakS = rng.stream('breakdown');
  const travelCv = c.noise?.travelCv ?? 0.08;
  const tmul = () => (det ? 1 : travelS.lognormal(1, travelCv));
  const mine = c.mine;

  const sh = new Map<number, ShovelRT>();
  for (const s of mine.shovels) sh.set(s.id, { id: s.id, spec: s, queue: [], loading: false, serviceEndsAt: 0, inbound: 0, served: 0, queueWaitSec: 0, busySec: 0, idleSec: 0, lastChange: 0, down: false, repairEndsAt: 0 });
  // dumps are c-servers (bays): `dumpServers` counts BUSY bays, `baysOf` the capacity. A 1-bay dump is a
  // single-server FIFO (servers in {0,1}), byte-identical to the legacy boolean.
  const dumpById = new Map(mine.dumps.map((d) => [d.id, d]));
  const baysOf = (id: number) => Math.max(1, dumpById.get(id)?.bays ?? 1);
  const isCrusher = (id: number) => dumpById.get(id)?.kind === 'crusher';
  const crushersList = mine.dumps.filter((d) => d.kind === 'crusher');
  const stockpiles = mine.dumps.filter((d) => d.kind === 'stockpile');
  const dumpServers = new Map<number, number>(), dumpQ = new Map<number, number[]>();
  for (const d of mine.dumps) { dumpServers.set(d.id, 0); dumpQ.set(d.id, []); }
  // stockpile levels (tonnes stacked) + a reclaim target crusher per stockpile (nearest crusher, or authored)
  const stockLevel = new Map<number, number>();
  const stockTarget = new Map<number, number>();
  for (const sp of stockpiles) {
    stockLevel.set(sp.id, 0);
    const tgt = sp.reclaimTargetId ?? nearestByPos(sp.pos, crushersList) ?? (crushersList[0] ?? mine.dumps[0]).id;
    stockTarget.set(sp.id, tgt);
  }

  const truckArr = new Map<number, number>();    // truck id → time it joined its current shovel queue
  // OR tier (#22): trucks that will ask for a dispatch decision soon (at/near a dump), the
  // fleet view the joint-assignment policy solves over. Insertion order is deterministic.
  const pendingDecision = new Map<number, { readyEta: number; atDumpId: number }>();
  let tonnes = 0, truckWaitSec = 0;
  // the AGGREGATE ore-plant feed (all crushers) + independent per-crusher series; `capCrusher` is the
  // single crusher the crusherMaxTph cap (C10) gates on (backward-compatible with the one-crusher corpus).
  const capCrusher = crushersList[0] ?? mine.dumps[0];
  const crusherFeed: { t: number; tonnes: number }[] = [{ t: 0, tonnes: 0 }];
  let crusherTonnes = 0;
  const crusherFeeds = new Map<number, { t: number; tonnes: number }[]>();
  const crusherTonnesById = new Map<number, number>();
  for (const cr of crushersList) { crusherFeeds.set(cr.id, [{ t: 0, tonnes: 0 }]); crusherTonnesById.set(cr.id, 0); }
  const stockSeries = new Map<number, { t: number; level: number }[]>();
  for (const sp of stockpiles) stockSeries.set(sp.id, [{ t: 0, level: 0 }]);

  const feedCrusher = (crusherId: number, add: number, now: number) => {
    crusherTonnes += add; crusherFeed.push({ t: now, tonnes: crusherTonnes });
    const ct = (crusherTonnesById.get(crusherId) ?? 0) + add;
    crusherTonnesById.set(crusherId, ct);
    (crusherFeeds.get(crusherId) ?? crusherFeed).push({ t: now, tonnes: ct });
  };

  const truckById = new Map(c.fleet.trucks.map((t) => [t.id, t]));

  // ---- destination routing (multi-destination) ----
  // Ore -> nearest crusher; waste -> nearest waste dump. When the target crusher is backed up (all bays
  // busy AND its queue >= the stockpile's rehandle threshold) and a stockpile with room feeds it, the
  // loaded ore truck REHANDLES onto the stockpile instead (a reclaimer feeds the crusher later).
  const destFor = (s: ShovelRT): number => {
    const spec = s.spec;
    const accept = mine.dumps.filter((d) => d.accepts.includes(spec.faceType));
    const primary = (nearestDump(mine, spec.id, accept) ?? accept[0] ?? mine.dumps[0]).id;
    if (spec.faceType !== 'ore' || stockpiles.length === 0) return primary;
    const cand = stockpiles.filter((sp) => (stockTarget.get(sp.id) === primary)
      && mine.routes[rk(spec.id, sp.id)] && (stockLevel.get(sp.id) ?? 0) < (sp.areaCapacityT ?? Infinity));
    const sp = nearestDump(mine, spec.id, cand);
    if (!sp) return primary;
    const backedUp = (dumpServers.get(primary) ?? 0) >= baysOf(primary)
      && (dumpQ.get(primary)?.length ?? 0) >= (sp.rehandleAtQueue ?? 3);
    return backedUp ? sp.id : primary;
  };

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
      // a down shovel cannot start service until repaired: surface the remaining repair time so
      // reactive policies steer away from it (they cannot ANTICIPATE the failure, only react to it)
      const freeInSec = r.down ? Math.max(0, r.repairEndsAt - now)
        : r.loading ? Math.max(0, r.serviceEndsAt - now) : 0;
      return { id: spec.id, spec, queueLen: r.queue.length, loading: r.loading, inbound: r.inbound, freeInSec, loadMeanSec: spec.loadMeanSec };
    });
    const fromDump = atDumpId ?? capCrusher.id;
    const travelEmptySec = (toShovelId: number) => haulTimeSec(mine, toShovelId, fromDump, truck.spec, false);
    // OR tier (#22): the deciding truck + every truck pending a decision, with cross-truck ETAs
    const fleet = [
      { id: truckId, readyInSec: 0, atDumpId: fromDump },
      ...[...pendingDecision.entries()]
        .filter(([id]) => id !== truckId)
        .map(([id, p]) => ({ id, readyInSec: Math.max(0, p.readyEta - now), atDumpId: p.atDumpId })),
    ];
    const etaEmptySecFor = (tid: number, toShovelId: number) => {
      const tr = truckById.get(tid) ?? truck;
      const from = tid === truckId ? fromDump : (pendingDecision.get(tid)?.atDumpId ?? fromDump);
      return haulTimeSec(mine, toShovelId, from, tr.spec, false);
    };
    return { now, truck, atDumpId, shovels, travelEmptySec, fleet, etaEmptySecFor };
  };

  // ---- shovel breakdown / repair (C16): Poisson failure + repair, interrupting service ----
  const scheduleFailure = (s: ShovelRT) => {
    const bd = s.spec.breakdown; if (!bd) return;
    const dt = det ? bd.mtbfSec : breakS.exp(bd.mtbfSec);   // det: fire at regular mean intervals (reproducible)
    sim.schedule(dt, () => onFailure(s), 0);
  };
  const onFailure = (s: ShovelRT) => {
    if (s.down) return;
    const now = sim.now();
    // the failure blocks STARTING new services; a load already in progress finishes normally, then the
    // shovel sits down (queued trucks wait, accruing queue wait) until the repair completes.
    s.down = true;
    const bd = s.spec.breakdown!;
    const rep = det ? bd.mttrSec : breakS.exp(bd.mttrSec);
    s.repairEndsAt = now + rep;
    sim.schedule(rep, () => onRepair(s), 0);
  };
  const onRepair = (s: ShovelRT) => {
    s.down = false; s.lastChange = sim.now();
    tryStartShovel(s);
    scheduleFailure(s);                          // next failure cycle
  };

  // ---- start a shovel service if idle + queue non-empty ----
  const tryStartShovel = (s: ShovelRT) => {
    if (s.down || s.loading || s.queue.length === 0) return;
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
    const dumpId = destFor(s);
    const tt = haulTimeSec(mine, s.id, dumpId, truck.spec, true) * tmul();
    const sp = posOf('shovel', s.id), dp = posOf('dump', dumpId);
    stay(truckId, sp, arr, now, 'atShovel', s.id);
    move(truckId, sp, dp, now, now + tt, 'haulFull', dumpId, s.spec.faceType);
    sim.schedule(tt, () => arriveDump(truckId, dumpId), 1);
  };

  const arriveDump = (truckId: number, dumpId: number) => {
    const q = dumpQ.get(dumpId)!;
    truckArr.set(truckId, sim.now());
    const d = mine.dumps.find((x) => x.id === dumpId)!;
    pendingDecision.set(truckId, { readyEta: sim.now() + (q.length + 1) * d.dumpMeanSec, atDumpId: dumpId });
    q.push(truckId);
    tryStartDump(dumpId);
  };

  const tryStartDump = (dumpId: number) => {
    // start as many trucks as there are FREE bays (a 2-bay crusher tips two trucks in parallel).
    const bays = baysOf(dumpId);
    const q = dumpQ.get(dumpId)!;
    while ((dumpServers.get(dumpId) ?? 0) < bays && q.length > 0) {
      const truckId = q.shift()!;
      truckWaitSec += sim.now() - (truckArr.get(truckId) ?? sim.now());
      dumpServers.set(dumpId, (dumpServers.get(dumpId) ?? 0) + 1);
      const d = dumpById.get(dumpId)!;
      const dur = det ? d.dumpMeanSec : dumpS.lognormal(d.dumpMeanSec, 0.25);
      sim.schedule(dur, () => onDumped(truckId, dumpId), 0);
    }
  };

  const onDumped = (truckId: number, dumpId: number) => {
    const now = sim.now();
    const truck = truckById.get(truckId)!;
    tonnes += truck.spec.payloadT;
    if (c.constraints?.crusherMaxTph != null && dumpId === capCrusher.id) {
      oreInFlightT = Math.max(0, oreInFlightT - truck.spec.payloadT);   // commitment delivered
    }
    if (isCrusher(dumpId)) feedCrusher(dumpId, truck.spec.payloadT, now);
    else if (dumpById.get(dumpId)?.kind === 'stockpile') {              // REHANDLE: material stacks on the pile
      const d = dumpById.get(dumpId)!;
      const lvl = Math.min((stockLevel.get(dumpId) ?? 0) + truck.spec.payloadT, d.areaCapacityT ?? Infinity);
      stockLevel.set(dumpId, lvl);
      stockSeries.get(dumpId)?.push({ t: now, level: lvl });
    }
    dumpServers.set(dumpId, Math.max(0, (dumpServers.get(dumpId) ?? 1) - 1));
    tryStartDump(dumpId);
    decide(truckId, dumpId);
  };

  // ---- stockpile reclaim (a SINK becomes a SOURCE): draw the pile down at reclaimRateTph to feed its
  //      target crusher, on a fixed deterministic time grid (no RNG). The reclaimer feeds even when the
  //      pit cannot, so a full stockpile keeps the plant fed. ----
  const scheduleReclaim = (sp: DumpSpec) => { sim.schedule(RECLAIM_DT, () => onReclaim(sp), 0); };
  const onReclaim = (sp: DumpSpec) => {
    const now = sim.now();
    const lvl = stockLevel.get(sp.id) ?? 0;
    const draw = Math.min(lvl, (sp.reclaimRateTph ?? 0) * (RECLAIM_DT / 3600));
    if (draw > 0) {
      stockLevel.set(sp.id, lvl - draw);
      stockSeries.get(sp.id)?.push({ t: now, level: lvl - draw });
      feedCrusher(stockTarget.get(sp.id) ?? capCrusher.id, draw, now);
    }
    scheduleReclaim(sp);
  };

  // ---- the dispatch decision, under the operational constraints (#22 P3) ----
  let invalidChoices = 0;
  let oreInFlightT = 0;                        // dispatched-but-not-yet-dumped ore commitment
  const trailingTph = (now: number): number => {
    // crusher feed over the trailing hour PLUS the committed in-flight ore: gating on delivered
    // tonnage alone is bang-bang (the window drains, then the WHOLE held fleet releases at once
    // and overshoots the cap, field-found by the C10 case test). Counting commitments releases
    // trucks a few at a time and keeps the ceiling a ceiling.
    const t0 = now - 3600;
    let base = 0;
    for (let i = crusherFeed.length - 1; i >= 0; i--) {
      if (crusherFeed[i].t <= t0) { base = crusherFeed[i].tonnes; break; }
    }
    return crusherTonnes - base + oreInFlightT;
  };
  const decide = (truckId: number, dumpId: number) => {
    const cons = c.constraints;
    const now = sim.now();
    // shift break: the decision (and the truck) HOLDS until the window ends
    const resumeAt = inBreak(cons, now);
    if (resumeAt != null) {
      truckWaitSec += resumeAt - now;
      sim.schedule(resumeAt - now, () => decide(truckId, dumpId), 2);
      return;
    }
    const state = buildState(truckId, dumpId, now);
    const truck = truckById.get(truckId)!;
    const feasibleAll = feasibleShovels(state.shovels, cons, { now, truck, crusherTphTrailing: trailingTph(now) });
    // material-lane empty-return (#67 round 2): the ONLY empty move is delivery-point -> a SHOVEL of the SAME
    // material lane (crusher/stockpile -> an ore face; waste dump -> a waste face). This keeps every empty leg
    // ON a DRAWN loaded road (its reverse) instead of interpolating across empty space, and it is domain-true
    // (an ore hauler stays in the ore lane). Single-material cases are unaffected (the lane is every shovel),
    // so the tie / oracle / parity controls stay byte-identical.
    const lane: 'ore' | 'waste' = dumpById.get(dumpId)?.kind === 'waste' ? 'waste' : 'ore';
    const feasible = feasibleAll.filter((v) => v.spec.faceType === lane);
    if (feasible.length === 0) {
      // no same-lane feasible shovel right now (all capped / in a break): HOLD and re-ask (never cross lanes
      // onto an off-road empty leg). Counted as wait.
      truckWaitSec += 60;
      sim.schedule(60, () => decide(truckId, dumpId), 2);
      return;
    }
    // policies only SEE the feasible set, every policy respects constraints by construction
    const constrained: DispatchState = { ...state, shovels: feasible };
    let chosen = policy(constrained);
    opts.onDecision?.(constrained, chosen);  // log (state, action) for the offline-RL / imitation dataset
    if (!feasible.some((v) => v.id === chosen)) {
      invalidChoices++;
      chosen = nearestFeasible(constrained, feasible);
    }
    dispatchTo(truckId, dumpId, chosen, now);
  };

  const dispatchTo = (truckId: number, dumpId: number, chosen: number, now: number) => {
    pendingDecision.delete(truckId);            // decided: it leaves the pending fleet view
    const truck = truckById.get(truckId)!;
    if (c.constraints?.crusherMaxTph != null
        && mine.shovels.find((s) => s.id === chosen)?.faceType === 'ore') {
      oreInFlightT += truck.spec.payloadT;      // commit against the crusher ceiling
    }
    const arr = truckArr.get(truckId) ?? now;
    const target = sh.get(chosen) ?? sh.get(mine.shovels[0].id)!;
    target.inbound++;
    const tt = haulTimeSec(mine, target.id, dumpId, truck.spec, false) * tmul();
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

  // ---- arm the breakdown clocks (C16) ----
  for (const s of mine.shovels) { const r = sh.get(s.id)!; if (s.breakdown) scheduleFailure(r); }

  // ---- arm the stockpile reclaimers (fixed grid, deterministic) ----
  for (const sp of stockpiles) scheduleReclaim(sp);

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
    crusherFeeds: crushersList.length > 1 ? Object.fromEntries(crusherFeeds) : undefined,
    stockLevels: stockpiles.length > 0 ? Object.fromEntries(stockSeries) : undefined,
    matchFactor: analyticalMatchFactor(c),
    trace,
    invalidChoices,
  };
}
