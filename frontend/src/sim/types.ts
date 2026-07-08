// Domain model for the open-pit truck-shovel dispatch simulation. A mine is a set of shovels (ore/waste
// faces) and dumps (crusher / waste / stockpile) connected by routes carrying distance + grade. The fleet
// cycles shovel → dump → shovel; the dispatch POLICY decides the next shovel at each dump-complete. Every
// quantity is physically grounded (kinematics, Erlang load times) and the whole run is deterministic.
import { type TruckSpec } from './kinematics';

export interface NodePos { x: number; y: number; }

export interface ShovelSpec {
  id: number; name: string; pos: NodePos;
  loadMeanSec: number;       // mean load time
  loadPasses: number;        // Erlang-k shape (bucket passes); fewer passes = higher load-time CV
  spotMeanSec: number;       // truck spotting before loading
  faceType: 'ore' | 'waste';
  grade: number;             // %Cu of the face (blend constraint, later)
  /** Poisson breakdown + repair on this shovel (C16). Absent = never fails. The failure interrupts
   *  service; queued trucks wait for the repair. A myopic policy keeps committing trucks to a shovel
   *  that is about to (or has just) failed; a look-ahead policy sampling futures can avoid it. */
  breakdown?: { mtbfSec: number; mttrSec: number };
}

export interface DumpSpec {
  id: number; name: string; pos: NodePos;
  kind: 'crusher' | 'waste' | 'stockpile';
  dumpMeanSec: number;       // spot + dump time
  accepts: ('ore' | 'waste')[];
}

/** Loaded-direction route (shovel → dump): distance, grade %, rolling resistance %. Empty return negates grade. */
export interface Route { distM: number; gradePct: number; rrPct: number; }

/** Parametric 2.5D pit topography: a terraced (benched) elliptical pit with a spiral ramp. Optional , 
 *  cases without one get a derived default (topo.ts). Purely REPRESENTATIONAL for the 3D view: cycle TIMES
 *  always come from the DES kinematics over the case's route distM/grade; the 3D path only shows WHERE the
 *  truck is along its leg. */
export interface PitTopoSpec {
  center: NodePos;              // pit centre in case world coords (treated as metres)
  rimRx: number; rimRy: number; // rim (surface) half-axes [m]
  nBenches: number;             // levels below the rim (floor = bench nBenches)
  benchHeightM: number;         // vertical bench height (e.g. 15)
  benchWidthM: number;          // horizontal catch-berm width per bench
  faceAngleDeg?: number;        // bench face angle from horizontal (default 65)
  rampWidthM?: number;          // spiral ramp width (default 25)
  shovelBench: Record<number, number>; // shovelId -> bench index (1..nBenches; deeper = larger)
  // dumps (crusher/waste) sit at the rim (z=0) at their case position
}

// minehaulsim.minetopo/v1, the underground topography contract (#21): levels, decline
// polyline, shafts and ore passes in world metres. Representational for the 3D view.
export interface MineTopo {
  schema: string;                                   // 'minehaulsim.minetopo/v1'
  levels: { index: number; z: number; drawpoints: number[][] }[];
  decline: number[][];                              // [x, y, z] polyline, surface → haulage
  shafts: { bin: number[] }[];
  ore_passes: { chute: number[]; tips: number[][] }[];
}

export interface MineSpec {
  name: string;
  shovels: ShovelSpec[];
  dumps: DumpSpec[];
  routes: Record<string, Route>;  // key `${shovelId}->${dumpId}`
  topo?: PitTopoSpec;             // optional pit topography (3D view); derived default if absent
  minetopo?: MineTopo;            // underground topography (#21); the 3D renders it when present
}

export interface TruckUnit { id: number; spec: TruckSpec; startShovel: number; }
export interface FleetSpec { trucks: TruckUnit[]; }

export interface CaseSpec {
  id: string; name: string;
  mine: MineSpec; fleet: FleetSpec;
  shiftSec: number;
  blendWindow?: { min: number; max: number };  // crusher grade window (binding-blend cases)
  /** Operational constraints (#22): enforced by the DES BEFORE any policy sees the state. */
  constraints?: import('./constraints').OperationalConstraints;
  /** Per-case stochastic amplitude (C15/C16). travelCv overrides the default 0.08 lognormal travel
   *  noise; a higher CV is the regime where variance-driven bunching makes myopic assignment
   *  genuinely suboptimal and a Monte-Carlo rollout can defensibly help. */
  noise?: { travelCv?: number };
}

// ---- dispatch policy interface ----
export interface ShovelView {
  id: number; spec: ShovelSpec;
  queueLen: number;          // trucks waiting (not counting the one loading)
  loading: boolean;          // is the shovel currently serving a truck
  inbound: number;           // trucks en route to this shovel (assigned, not yet arrived)
  freeInSec: number;         // est seconds until the shovel can start the next truck (0 if idle now)
  loadMeanSec: number;
}
export interface FleetTruckView {
  id: number;
  readyInSec: number;        // est seconds until this truck needs a dispatch decision
  atDumpId: number;          // where it will decide from
}
export interface DispatchState {
  now: number;
  truck: TruckUnit;
  atDumpId: number | null;   // current location (null at shift start)
  shovels: ShovelView[];
  travelEmptySec: (toShovelId: number) => number;  // est empty-haul time from current position
  // OR tier (#22, ADDITIVE, heuristic policies ignore them): the trucks that will ask for a
  // dispatch decision within the assignment window, and cross-truck empty-travel estimates.
  fleet?: FleetTruckView[];
  etaEmptySecFor?: (truckId: number, toShovelId: number) => number;
}
export type Policy = (s: DispatchState) => number;  // → chosen shovel id

// ---- animation trace (optional), straight-line legs the pit map interpolates over the playback clock ----
export type LegState = 'haulFull' | 'haulEmpty' | 'atShovel' | 'atDump';
export interface Leg { truck: number; x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; state: LegState; node: number; }

export interface ShovelKpi { id: number; name: string; served: number; queueWaitSec: number; busySec: number; idleSec: number; util: number; }
export interface SimResult {
  caseId: string; policy: string; seed: number; shiftSec: number;
  tonnes: number;
  truckWaitSec: number;
  shovels: ShovelKpi[];
  meanShovelUtil: number;
  crusherFeed: { t: number; tonnes: number }[];   // cumulative tonnes at the ore crusher
  matchFactor: number;
  trace?: Leg[];                                   // present only when run with { trace: true }
  /** #22: times a policy returned a constraint-infeasible shovel (re-assigned + counted). */
  invalidChoices?: number;
}
