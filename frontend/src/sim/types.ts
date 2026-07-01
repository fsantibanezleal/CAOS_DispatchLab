// Domain model for the open-pit truck-shovel dispatch simulation. A mine is a set of shovels (ore/waste
// faces) and dumps (crusher / waste / stockpile) connected by routes carrying distance + grade. The fleet
// cycles shovel → dump → shovel; the dispatch POLICY decides the next shovel at each dump-complete. Every
// quantity is physically grounded (kinematics, Erlang load times) and the whole run is deterministic.
import { type TruckSpec } from './kinematics';

export interface NodePos { x: number; y: number; }

export interface ShovelSpec {
  id: number; name: string; pos: NodePos;
  loadMeanSec: number;       // mean load time
  loadPasses: number;        // Erlang-k shape (bucket passes)
  spotMeanSec: number;       // truck spotting before loading
  faceType: 'ore' | 'waste';
  grade: number;             // %Cu of the face (blend constraint, later)
}

export interface DumpSpec {
  id: number; name: string; pos: NodePos;
  kind: 'crusher' | 'waste' | 'stockpile';
  dumpMeanSec: number;       // spot + dump time
  accepts: ('ore' | 'waste')[];
}

/** Loaded-direction route (shovel → dump): distance, grade %, rolling resistance %. Empty return negates grade. */
export interface Route { distM: number; gradePct: number; rrPct: number; }

/** Parametric 2.5D pit topography: a terraced (benched) elliptical pit with a spiral ramp. Optional —
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

export interface MineSpec {
  name: string;
  shovels: ShovelSpec[];
  dumps: DumpSpec[];
  routes: Record<string, Route>;  // key `${shovelId}->${dumpId}`
  topo?: PitTopoSpec;             // optional pit topography (3D view); derived default if absent
}

export interface TruckUnit { id: number; spec: TruckSpec; startShovel: number; }
export interface FleetSpec { trucks: TruckUnit[]; }

export interface CaseSpec {
  id: string; name: string;
  mine: MineSpec; fleet: FleetSpec;
  shiftSec: number;
  blendWindow?: { min: number; max: number };  // crusher grade window (binding-blend cases)
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
export interface DispatchState {
  now: number;
  truck: TruckUnit;
  atDumpId: number | null;   // current location (null at shift start)
  shovels: ShovelView[];
  travelEmptySec: (toShovelId: number) => number;  // est empty-haul time from current position
}
export type Policy = (s: DispatchState) => number;  // → chosen shovel id

// ---- animation trace (optional) — straight-line legs the pit map interpolates over the playback clock ----
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
}
