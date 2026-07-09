// A FORKABLE truck-shovel discrete-event simulator, the internal MODEL the Monte-Carlo rollout dispatcher
// looks ahead with. It reproduces model.ts's cycle EXACTLY (same kinematics, same integer-tick clock, same
// event order, same RNG streams) but stores the future-event list and all state as PLAIN DATA (no closures),
// so a running simulation can be cloned mid-decision (`fork()`), the branch reseeded with independent noise
// (`reseedFutures()`), and rolled out to a horizon under a base policy. model.ts keeps its closure-based form
// for the live app; this engine is validated byte-for-byte against it on the deterministic corpus
// (test/rolloutSim.test.ts) so the look-ahead is the SAME physics, not a rigged surrogate.
//
// Refs for the rollout it powers: Bertsekas, Tsitsiklis & Wu 1997 (rollout as one policy-improvement step,
// DOI 10.1023/A:1009635226865); Bertsekas & Castanon 1999 (the stochastic-scheduling variant,
// DOI 10.1023/A:1009634810396).
import { toTicks, toSec } from './des';
import { Rng } from '../lib/rng';
import { haulTimeSec } from './haul';
import { feasibleShovels, inBreak, nearestFeasible } from './constraints';
import { type CaseSpec, type Policy, type DispatchState, type ShovelView, type MineSpec, type DumpSpec } from './types';

type EvType = 'loaded' | 'arriveDump' | 'dumped' | 'reDecide' | 'arriveShovel' | 'failure' | 'repair' | 'reclaim';
interface Ev { tick: number; prio: number; seq: number; type: EvType; t: number; n: number; }

interface ShRT {
  id: number; queue: number[]; loading: boolean; serviceEndsAt: number; inbound: number;
  served: number; queueWaitSec: number; busySec: number; idleSec: number; lastChange: number;
  down: boolean; repairEndsAt: number;
}

// All mutable, cloneable state (plain data only, structuredClone-safe).
interface St {
  nowTick: number; seq: number;
  fel: Ev[];
  sh: Record<number, ShRT>;
  dumpServers: Record<number, number>;   // BUSY bays per dump (c-server); 1-bay = single-server FIFO
  dumpQ: Record<number, number[]>;
  stockLevel: Record<number, number>;    // stockpile tonnes stacked (rehandle raises, reclaim lowers)
  truckArr: Record<number, number>;
  pending: Record<number, { readyEta: number; atDumpId: number }>;   // trucks awaiting a decision (fleet view)
  tonnes: number; truckWaitSec: number;
  crusherTonnes: number; crusherFeed: { t: number; tonnes: number }[];
  oreInFlightT: number; invalidChoices: number;
  roadLastArrival: Record<string, number>;   // directed-road car-following state (#87), see carFollow()
  decision: { truckId: number; dumpId: number } | null;              // the decision awaiting commit()
}

const rk = (s: number, d: number) => `${s}->${d}`;
const RECLAIM_DT = 60;
import { SECURITY_M, MEETING_S, speedLimitedSec } from './traffic';

function nearestDumpRt(mine: MineSpec, shovelId: number, cand: DumpSpec[]): DumpSpec | undefined {
  let best: DumpSpec | undefined, bestD = Infinity;
  for (const d of cand) {
    const r = mine.routes[rk(shovelId, d.id)];
    if (!r) continue;
    if (r.distM < bestD - 1e-9 || (Math.abs(r.distM - bestD) <= 1e-9 && (!best || d.id < best.id))) { best = d; bestD = r.distM; }
  }
  return best;
}
function nearestByPos(from: { x: number; y: number }, cand: DumpSpec[]): number | undefined {
  let best: DumpSpec | undefined, bestD = Infinity;
  for (const d of cand) {
    const dist = Math.hypot(d.pos.x - from.x, d.pos.y - from.y);
    if (dist < bestD - 1e-9 || (Math.abs(dist - bestD) <= 1e-9 && (!best || d.id < best.id))) { best = d; bestD = dist; }
  }
  return best?.id;
}

export interface RolloutObjective { tonnes: number; waitH: number; }

export class RolloutSim {
  c: CaseSpec;
  private mine: MineSpec;
  private det: boolean;
  private travelCv: number;
  private crusherId: number;                    // the cap crusher (crusherMaxTph gates on this one)
  private crushersList: DumpSpec[];
  private stockpiles: DumpSpec[];
  private stockTarget: Record<number, number>;  // stockpile id -> reclaim target crusher id (static)
  private st: St;
  private rng: Rng;
  private _feasible: ShovelView[] = [];
  private _state: DispatchState | null = null;
  private truckById: Map<number, CaseSpec['fleet']['trucks'][number]>;

  constructor(c: CaseSpec, seed: number, opts: { deterministic?: boolean } = {}) {
    this.c = c; this.mine = c.mine; this.det = !!opts.deterministic;
    this.travelCv = c.noise?.travelCv ?? 0.08;
    this.crushersList = this.mine.dumps.filter((d) => d.kind === 'crusher');
    this.stockpiles = this.mine.dumps.filter((d) => d.kind === 'stockpile');
    this.crusherId = (this.crushersList[0] ?? this.mine.dumps[0]).id;
    this.stockTarget = {};
    for (const sp of this.stockpiles) {
      this.stockTarget[sp.id] = sp.reclaimTargetId ?? nearestByPos(sp.pos, this.crushersList) ?? this.crusherId;
    }
    this.rng = new Rng(seed);
    this.truckById = new Map(c.fleet.trucks.map((t) => [t.id, t]));
    const sh: Record<number, ShRT> = {};
    for (const s of this.mine.shovels) sh[s.id] = { id: s.id, queue: [], loading: false, serviceEndsAt: 0, inbound: 0, served: 0, queueWaitSec: 0, busySec: 0, idleSec: 0, lastChange: 0, down: false, repairEndsAt: 0 };
    const dumpServers: Record<number, number> = {}, dumpQ: Record<number, number[]> = {}, stockLevel: Record<number, number> = {};
    for (const d of this.mine.dumps) { dumpServers[d.id] = 0; dumpQ[d.id] = []; }
    for (const sp of this.stockpiles) stockLevel[sp.id] = 0;
    this.st = {
      nowTick: 0, seq: 0, fel: [], sh, dumpServers, dumpQ, stockLevel, truckArr: {}, pending: {},
      tonnes: 0, truckWaitSec: 0, crusherTonnes: 0, crusherFeed: [{ t: 0, tonnes: 0 }],
      oreInFlightT: 0, invalidChoices: 0, roadLastArrival: {}, decision: null,
    };
    // arm breakdown clocks + stockpile reclaimers + initial dispatch (each truck heads to its start shovel)
    for (const s of this.mine.shovels) if (s.breakdown) this.scheduleFailure(s.id);
    for (const sp of this.stockpiles) this.schedule(RECLAIM_DT, 'reclaim', 0, sp.id, 0);
    for (const t of c.fleet.trucks) {
      const stagger = this.det ? 0 : this.rng.stream('travel').range(0, 30);
      this.schedule(stagger, 'arriveShovel', t.id, t.startShovel, 1);
    }
  }

  // ---------- private helpers ----------
  private get nowSec(): number { return toSec(this.st.nowTick); }
  private shovelSpec(id: number) { return this.mine.shovels.find((x) => x.id === id)!; }
  private dumpSpec(id: number) { return this.mine.dumps.find((x) => x.id === id)!; }
  private baysOf(id: number) { return Math.max(1, this.dumpSpec(id).bays ?? 1); }
  private isCrusher(id: number) { return this.dumpSpec(id).kind === 'crusher'; }
  /** Multi-destination routing (mirror of model.ts destFor): ore -> nearest crusher, rehandled onto a
   *  stockpile when that crusher is backed up + the pile has room; waste -> nearest waste dump. */
  private destFor(shovelId: number): number {
    const spec = this.shovelSpec(shovelId);
    const accept = this.mine.dumps.filter((d) => d.accepts.includes(spec.faceType));
    const primary = (nearestDumpRt(this.mine, shovelId, accept) ?? accept[0] ?? this.mine.dumps[0]).id;
    if (spec.faceType !== 'ore' || this.stockpiles.length === 0) return primary;
    const cand = this.stockpiles.filter((sp) => (this.stockTarget[sp.id] === primary)
      && this.mine.routes[rk(shovelId, sp.id)] && (this.st.stockLevel[sp.id] ?? 0) < (sp.areaCapacityT ?? Infinity));
    const sp = nearestDumpRt(this.mine, shovelId, cand);
    if (!sp) return primary;
    const backedUp = (this.st.dumpServers[primary] ?? 0) >= this.baysOf(primary)
      && (this.st.dumpQ[primary]?.length ?? 0) >= (sp.rehandleAtQueue ?? 3);
    return backedUp ? sp.id : primary;
  }
  private tmul(): number { return this.det ? 1 : this.rng.stream('travel').lognormal(1, this.travelCv); }

  private schedule(delaySec: number, type: EvType, t: number, n: number, prio: number): void {
    this.st.fel.push({ tick: this.st.nowTick + toTicks(delaySec), prio, seq: this.st.seq++, type, t, n });
  }

  /** Pop the earliest event (tick, prio, seq); linear scan (the FEL holds ~one event per truck). */
  private pop(stopTick: number): Ev | null {
    const fel = this.st.fel;
    if (fel.length === 0) return null;
    let bi = -1, be: Ev | null = null;
    for (let i = 0; i < fel.length; i++) {
      const e = fel[i];
      if (be === null || e.tick < be.tick || (e.tick === be.tick && (e.prio < be.prio || (e.prio === be.prio && e.seq < be.seq)))) { be = e; bi = i; }
    }
    if (!be || be.tick > stopTick) return null;
    fel.splice(bi, 1);
    this.st.nowTick = be.tick;
    return be;
  }

  private markShovel(s: ShRT, busy: boolean): void {
    const dt = this.nowSec - s.lastChange;
    if (s.loading) s.busySec += dt; else s.idleSec += dt;
    s.lastChange = this.nowSec; s.loading = busy;
  }

  private tryStartShovel(s: ShRT): void {
    if (s.down || s.loading || s.queue.length === 0) return;
    const truckId = s.queue.shift()!;
    const wait = this.nowSec - (this.st.truckArr[truckId] ?? this.nowSec);
    s.queueWaitSec += wait; this.st.truckWaitSec += wait;
    this.markShovel(s, true);
    const spec = this.shovelSpec(s.id);
    const loadS = this.rng.stream('load');
    const spot = spec.spotMeanSec > 0 ? (this.det ? spec.spotMeanSec : loadS.lognormal(spec.spotMeanSec, 0.3)) : 0;
    const load = this.det ? spec.loadMeanSec : loadS.erlang(spec.loadPasses, spec.loadMeanSec);
    const dur = spot + load;
    s.serviceEndsAt = this.nowSec + dur;
    this.schedule(dur, 'loaded', truckId, s.id, 0);
  }

  private onLoaded(truckId: number, shovelId: number): void {
    const s = this.st.sh[shovelId];
    this.markShovel(s, false); s.served++;
    this.tryStartShovel(s);
    const dumpId = this.destFor(shovelId);
    const truck = this.truckById.get(truckId)!;
    const freeTt = haulTimeSec(this.mine, shovelId, dumpId, truck.spec, true) * this.tmul();
    const distM = this.mine.routes[rk(shovelId, dumpId)]?.distM ?? 0;
    const tt = this.carFollow(`L:${shovelId}->${dumpId}`, `E:${dumpId}->${shovelId}`, freeTt, distM);
    this.schedule(tt, 'arriveDump', truckId, dumpId, 1);
  }

  // haul-road traffic (#87), MUST mirror model.ts exactly: posted speed limit + FIFO security-distance
  // headway (no overtaking, bunching) + two-way meeting slowdown. Effective tt >= free-flow.
  private carFollow(dirKey: string, oppKey: string, freeFlowTt: number, distM: number): number {
    const depart = this.nowSec;
    const limitedTt = speedLimitedSec(freeFlowTt, distM);
    const headway = distM > 0 ? SECURITY_M * (limitedTt / distM) : 0;
    const prev = this.st.roadLastArrival[dirKey];
    let arrival = prev == null ? depart + limitedTt : Math.max(depart + limitedTt, prev + headway);
    const opp = this.st.roadLastArrival[oppKey];
    if (opp != null && opp > depart) arrival += MEETING_S;
    this.st.roadLastArrival[dirKey] = arrival;
    return arrival - depart;
  }

  private arriveDump(truckId: number, dumpId: number): void {
    this.st.truckArr[truckId] = this.nowSec;
    const d = this.dumpSpec(dumpId);
    const q = this.st.dumpQ[dumpId];
    this.st.pending[truckId] = { readyEta: this.nowSec + (q.length + 1) * d.dumpMeanSec, atDumpId: dumpId };
    q.push(truckId);
    this.tryStartDump(dumpId);
  }

  private tryStartDump(dumpId: number): void {
    const bays = this.baysOf(dumpId);
    const q = this.st.dumpQ[dumpId];
    while ((this.st.dumpServers[dumpId] ?? 0) < bays && q.length > 0) {
      const truckId = q.shift()!;
      this.st.truckWaitSec += this.nowSec - (this.st.truckArr[truckId] ?? this.nowSec);
      this.st.dumpServers[dumpId] = (this.st.dumpServers[dumpId] ?? 0) + 1;
      const d = this.dumpSpec(dumpId);
      const dur = this.det ? d.dumpMeanSec : this.rng.stream('dump').lognormal(d.dumpMeanSec, 0.25);
      this.schedule(dur, 'dumped', truckId, dumpId, 0);
    }
  }

  private feedCrusher(add: number): void {
    this.st.crusherTonnes += add;
    this.st.crusherFeed.push({ t: this.nowSec, tonnes: this.st.crusherTonnes });
  }

  private onDumped(truckId: number, dumpId: number): void {
    const truck = this.truckById.get(truckId)!;
    this.st.tonnes += truck.spec.payloadT;
    if (this.c.constraints?.crusherMaxTph != null && dumpId === this.crusherId) {
      this.st.oreInFlightT = Math.max(0, this.st.oreInFlightT - truck.spec.payloadT);
    }
    if (this.isCrusher(dumpId)) this.feedCrusher(truck.spec.payloadT);
    else if (this.dumpSpec(dumpId).kind === 'stockpile') {
      const d = this.dumpSpec(dumpId);
      this.st.stockLevel[dumpId] = Math.min((this.st.stockLevel[dumpId] ?? 0) + truck.spec.payloadT, d.areaCapacityT ?? Infinity);
    }
    this.st.dumpServers[dumpId] = Math.max(0, (this.st.dumpServers[dumpId] ?? 1) - 1);
    this.tryStartDump(dumpId);
    this.st.decision = { truckId, dumpId };   // a dispatch decision is now pending (driver resolves it)
  }

  private onReclaim(stockpileId: number): void {
    const sp = this.dumpSpec(stockpileId);
    const lvl = this.st.stockLevel[stockpileId] ?? 0;
    const draw = Math.min(lvl, (sp.reclaimRateTph ?? 0) * (RECLAIM_DT / 3600));
    if (draw > 0) { this.st.stockLevel[stockpileId] = lvl - draw; this.feedCrusher(draw); }
    this.schedule(RECLAIM_DT, 'reclaim', 0, stockpileId, 0);
  }

  private trailingTph(): number {
    const t0 = this.nowSec - 3600;
    let base = 0;
    const cf = this.st.crusherFeed;
    for (let i = cf.length - 1; i >= 0; i--) { if (cf[i].t <= t0) { base = cf[i].tonnes; break; } }
    return this.st.crusherTonnes - base + this.st.oreInFlightT;
  }

  private buildDispatchState(truckId: number, atDumpId: number): DispatchState {
    const truck = this.truckById.get(truckId)!;
    const shovels: ShovelView[] = this.mine.shovels.map((spec) => {
      const r = this.st.sh[spec.id];
      const freeInSec = r.down ? Math.max(0, r.repairEndsAt - this.nowSec)
        : r.loading ? Math.max(0, r.serviceEndsAt - this.nowSec) : 0;
      return { id: spec.id, spec, queueLen: r.queue.length, loading: r.loading, inbound: r.inbound, freeInSec, loadMeanSec: spec.loadMeanSec };
    });
    const fromDump = atDumpId;
    const travelEmptySec = (toShovelId: number) => haulTimeSec(this.mine, toShovelId, fromDump, truck.spec, false);
    const fleet = [
      { id: truckId, readyInSec: 0, atDumpId: fromDump },
      ...Object.entries(this.st.pending).filter(([id]) => Number(id) !== truckId)
        .map(([id, p]) => ({ id: Number(id), readyInSec: Math.max(0, p.readyEta - this.nowSec), atDumpId: p.atDumpId })),
    ];
    const etaEmptySecFor = (tid: number, toShovelId: number) => {
      const tr = this.truckById.get(tid) ?? truck;
      const from = tid === truckId ? fromDump : (this.st.pending[tid]?.atDumpId ?? fromDump);
      return haulTimeSec(this.mine, toShovelId, from, tr.spec, false);
    };
    return { now: this.nowSec, truck, atDumpId, shovels, travelEmptySec, fleet, etaEmptySecFor };
  }

  private dispatchTo(truckId: number, dumpId: number, chosen: number): void {
    delete this.st.pending[truckId];
    const truck = this.truckById.get(truckId)!;
    if (this.c.constraints?.crusherMaxTph != null && this.shovelSpec(chosen)?.faceType === 'ore') {
      this.st.oreInFlightT += truck.spec.payloadT;
    }
    const target = this.st.sh[chosen] ?? this.st.sh[this.mine.shovels[0].id];
    target.inbound++;
    const freeTt = haulTimeSec(this.mine, target.id, dumpId, truck.spec, false) * this.tmul();
    const distM = this.mine.routes[rk(target.id, dumpId)]?.distM ?? 0;
    const tt = this.carFollow(`E:${dumpId}->${target.id}`, `L:${target.id}->${dumpId}`, freeTt, distM);
    this.schedule(tt, 'arriveShovel', truckId, target.id, 1);
  }

  private arriveShovel(truckId: number, shovelId: number): void {
    const s = this.st.sh[shovelId];
    s.inbound = Math.max(0, s.inbound - 1);
    this.st.truckArr[truckId] = this.nowSec;
    s.queue.push(truckId);
    this.tryStartShovel(s);
  }

  private scheduleFailure(shovelId: number): void {
    const bd = this.shovelSpec(shovelId).breakdown; if (!bd) return;
    const dt = this.det ? bd.mtbfSec : this.rng.stream('breakdown').exp(bd.mtbfSec);
    this.schedule(dt, 'failure', 0, shovelId, 0);
  }
  private onFailure(shovelId: number): void {
    const s = this.st.sh[shovelId]; if (s.down) return;
    s.down = true;
    const bd = this.shovelSpec(shovelId).breakdown!;
    const rep = this.det ? bd.mttrSec : this.rng.stream('breakdown').exp(bd.mttrSec);
    s.repairEndsAt = this.nowSec + rep;
    this.schedule(rep, 'repair', 0, shovelId, 0);
  }
  private onRepair(shovelId: number): void {
    const s = this.st.sh[shovelId];
    s.down = false; s.lastChange = this.nowSec;
    this.tryStartShovel(s);
    this.scheduleFailure(shovelId);
  }

  private handle(e: Ev): void {
    switch (e.type) {
      case 'loaded': this.onLoaded(e.t, e.n); break;
      case 'arriveDump': this.arriveDump(e.t, e.n); break;
      case 'dumped': this.onDumped(e.t, e.n); break;
      case 'reDecide': this.st.decision = { truckId: e.t, dumpId: e.n }; break;
      case 'arriveShovel': this.arriveShovel(e.t, e.n); break;
      case 'failure': this.onFailure(e.n); break;
      case 'repair': this.onRepair(e.n); break;
      case 'reclaim': this.onReclaim(e.n); break;
    }
  }

  /** Resolve a pending decision through the constraint gate (mirrors model.ts decide()). Returns
   *  'ready' when a real, feasible decision awaits commit(); 'held' when it was delayed (break /
   *  no feasible shovel); 'none' when nothing is pending. */
  private resolvePending(): 'ready' | 'held' | 'none' {
    const dec = this.st.decision;
    if (!dec) return 'none';
    const cons = this.c.constraints;
    const now = this.nowSec;
    const resumeAt = inBreak(cons, now);
    if (resumeAt != null) { this.st.truckWaitSec += resumeAt - now; this.schedule(resumeAt - now, 'reDecide', dec.truckId, dec.dumpId, 2); this.st.decision = null; return 'held'; }
    const state = this.buildDispatchState(dec.truckId, dec.dumpId);
    const truck = this.truckById.get(dec.truckId)!;
    const feasibleAll = feasibleShovels(state.shovels, cons, { now, truck, crusherTphTrailing: this.trailingTph() });
    // material-lane empty-return (#67 round 2): mirror of model.ts decide() so the two engines stay byte-parity.
    // The empty move is delivery-point -> a SHOVEL of the same lane (crusher/stockpile -> ore; waste -> waste).
    const lane: 'ore' | 'waste' = this.dumpSpec(dec.dumpId).kind === 'waste' ? 'waste' : 'ore';
    const feasible = feasibleAll.filter((v) => v.spec.faceType === lane);
    if (feasible.length === 0) { this.st.truckWaitSec += 60; this.schedule(60, 'reDecide', dec.truckId, dec.dumpId, 2); this.st.decision = null; return 'held'; }
    this._feasible = feasible;
    this._state = { ...state, shovels: feasible };
    return 'ready';
  }

  /** Advance to the next real dispatch decision; returns its (constrained) state, or null at horizon end. */
  runToNextDecision(untilSec: number): DispatchState | null {
    const stopTick = untilSec === Infinity ? Infinity : toTicks(untilSec);
    for (;;) {
      const r = this.resolvePending();
      if (r === 'ready') return this._state!;
      const e = this.pop(stopTick);
      if (!e) { if (stopTick !== Infinity) this.st.nowTick = stopTick; return null; }
      this.handle(e);
    }
  }

  /** Apply the chosen shovel to the pending decision (reassigning if infeasible), then continue. */
  commit(chosen: number): void {
    const dec = this.st.decision!;
    let c = chosen;
    if (!this._feasible.some((v) => v.id === c)) { this.st.invalidChoices++; c = nearestFeasible(this._state!, this._feasible); }
    this.dispatchTo(dec.truckId, dec.dumpId, c);
    this.st.decision = null;
  }

  /** Run to `untilSec` under a fixed policy (baselines + the rollout's base policy in a branch). */
  runWithPolicy(policy: Policy, untilSec: number): RolloutObjective {
    for (;;) {
      const st = this.runToNextDecision(untilSec);
      if (!st) break;
      this.commit(policy(st));
    }
    return this.objective();
  }

  objective(): RolloutObjective { return { tonnes: this.st.tonnes, waitH: this.st.truckWaitSec / 3600 }; }
  get tonnes(): number { return this.st.tonnes; }
  get waitH(): number { return this.st.truckWaitSec / 3600; }

  /** Deep, independent copy of the running simulation (state + RNG), for a look-ahead branch. Pass
   *  `overrideDet` to plan the branch on the mean (deterministic) model while the committed run is
   *  stochastic (certainty-equivalent rollout). */
  fork(overrideDet?: boolean): RolloutSim {
    const s = Object.create(RolloutSim.prototype) as RolloutSim;
    // (in a class method, private members of any RolloutSim instance are accessible)
    s.c = this.c; s.mine = this.mine; s.det = overrideDet ?? this.det;
    s.travelCv = this.travelCv; s.crusherId = this.crusherId; s.truckById = this.truckById;
    s.crushersList = this.crushersList; s.stockpiles = this.stockpiles; s.stockTarget = this.stockTarget;
    s.st = structuredClone(this.st); s.rng = this.rng.clone();
    s._feasible = []; s._state = null;
    return s;
  }

  /** Draw an INDEPENDENT sampled future in this branch (the rollout cannot see the realized noise). */
  reseedFutures(seed: number): void { this.rng.reseedAll(seed); }
}
