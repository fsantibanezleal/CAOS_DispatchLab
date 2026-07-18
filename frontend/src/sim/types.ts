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
  /** Receiving BAYS: a c-server. A crusher with 2 bays serves 2 trucks in parallel (double-side tip).
   *  Absent = 1 (single-server FIFO, identical to the legacy behaviour). */
  bays?: number;
  /** Stockpile-only. A stockpile is a sink that becomes a source: ore trucks rehandle onto it when the
   *  crusher is backed up (all bays busy + a queue), and a reclaimer draws it down at `reclaimRateTph` to
   *  feed its target crusher when the pit cannot. `areaCapacityT` is the finite stacking capacity (tonnes);
   *  a full stockpile stops accepting rehandle. `rehandleAtQueue` is the crusher queue length that triggers
   *  diversion (default 3). `reclaimTargetId` is the crusher the reclaimer feeds (default: nearest crusher). */
  areaCapacityT?: number;
  reclaimRateTph?: number;
  rehandleAtQueue?: number;
  reclaimTargetId?: number;
}

/** Loaded-direction route (shovel → dump): distance, grade %, rolling resistance %. Empty return negates grade. */
export interface Route { distM: number; gradePct: number; rrPct: number; }

/** Parametric 2.5D pit topography: a terraced (benched) elliptical pit with a spiral ramp. Optional,
 *  cases without one get a derived default (topo.ts). Purely representational for the 3D view: cycle times
 *  always come from the DES kinematics over the case's route distM/grade; the 3D path only shows where the
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
  roads?: RoadsV1;              // minehaulsim.roads/v1 (structure-real samples, minehaulsim >= 0.12): the real network
}

/** `minehaulsim.roads/v1`: the real constrained road network shipped in a structure-real sample's topo.json,
 *  so the 3D view can render minehaulsim's actual roads + mirror the segment traffic model (CAOS_MINEHAUL #28). */
export interface RoadsV1 {
  schema: 'minehaulsim.roads/v1';
  nodes: { id: number; kind: string; pos: [number, number, number] }[];
  segments: { id: number; a: number; b: number; polyline: [number, number, number][]; oneWay: boolean; speedLimitKmh: number; rollingResistancePct?: number; zoneId: number | null }[];
  traffic: { headwayM?: number; headwayS?: number };
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
  routes: Record<string, Route>;  // key `${shovelId}->${dumpId}` (adjacency + ranking; combined distance)
  /** Pit portal / exit node (#67 round 2). When present, every haul between the pit and an external facility
   *  passes through this single portal: a loaded truck runs shovel -> internal pit road(s) -> portal -> a
   *  direct surface haul -> destination; an empty truck runs destination -> portal -> internal roads -> shovel.
   *  The DES leg time is the SUM of the two rimpull segments (`pitRoad` + `portalHaul`), never a single
   *  straight shovel->destination line. Absent (e.g. replayed real samples) = legacy single-segment route. */
  portal?: NodePos;
  pitRoad?: Record<number, Route>;    // shovelId -> internal leg (shovel <-> portal); carries the ramp grade
  portalHaul?: Record<number, Route>; // dumpId    -> surface leg (portal <-> destination); flatter
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
  /** Operational constraints (#22): enforced by the DES before any policy sees the state. */
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
export interface Leg { truck: number; x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; state: LegState; node: number; mat?: 'ore' | 'waste'; }

export interface ShovelKpi { id: number; name: string; served: number; queueWaitSec: number; busySec: number; idleSec: number; util: number; }
export interface SimResult {
  caseId: string; policy: string; seed: number; shiftSec: number;
  tonnes: number;
  truckWaitSec: number;
  shovels: ShovelKpi[];
  meanShovelUtil: number;
  crusherFeed: { t: number; tonnes: number }[];   // cumulative tonnes at the ORE plant(s) (all crushers aggregated)
  /** Per-crusher cumulative feed (one series per crusher-kind dump), the independent plant KPIs. */
  crusherFeeds?: Record<number, { t: number; tonnes: number }[]>;
  /** Per-stockpile level over the shift (tonnes stacked); rises on rehandle, falls on reclaim. */
  stockLevels?: Record<number, { t: number; level: number }[]>;
  matchFactor: number;
  trace?: Leg[];                                   // present only when run with { trace: true }
  /** #22: times a policy returned a constraint-infeasible shovel (re-assigned + counted). */
  invalidChoices?: number;
}
