// Portal-aware haul timing (#67 round 2). A pit has a single exit/portal; a haul between a shovel and an
// external facility (crusher / stockpile / waste dump) is a polyline: shovel <-> portal on the internal pit
// roads, then portal <-> destination on a direct surface haul. The DES leg time is the SUM of the two rimpull
// segments (never a single straight shovel->destination line). The authored grade is the loaded (climb-out)
// direction; the empty return negates it (descend into the pit / roll back on the surface). When a mine has
// no portal (a replayed real sample), we fall back to the legacy single-segment route. One function, used by
// model.ts, rolloutSim.ts and the capacity oracle, so the physics is identical everywhere.
import { travelTimeSec, type TruckSpec } from './kinematics';
import { type MineSpec, type Route } from './types';

const rk = (s: number, d: number) => `${s}->${d}`;
const DEFAULT_ROUTE: Route = { distM: 1500, gradePct: 0, rrPct: 3 };

/** The two ordered segments of a haul (shovel <-> portal, portal <-> destination), for the viz polyline. */
export function haulSegments(mine: MineSpec, shovelId: number, dumpId: number): Route[] | null {
  if (!mine.portal || !mine.pitRoad || !mine.portalHaul) return null;
  const a = mine.pitRoad[shovelId], b = mine.portalHaul[dumpId];
  if (!a || !b) return null;
  return [a, b];   // [internal pit road (shovel<->portal), surface haul (portal<->destination)]
}

/** Deterministic travel time (s) for one loaded/empty leg between a shovel and a destination.
 *  Portal mines: time(shovel<->portal) + time(portal<->destination), each from the rimpull kinematics.
 *  Legacy mines: a single segment from the combined route. */
export function haulTimeSec(mine: MineSpec, shovelId: number, dumpId: number, truck: TruckSpec, loaded: boolean): number {
  const segs = haulSegments(mine, shovelId, dumpId);
  if (segs) {
    // loaded climbs OUT (authored +grade); empty descends (negate). Order is irrelevant to the total time.
    const g = (r: Route) => (loaded ? r.gradePct : -r.gradePct);
    return travelTimeSec(segs[0].distM, g(segs[0]), segs[0].rrPct, truck, loaded)
         + travelTimeSec(segs[1].distM, g(segs[1]), segs[1].rrPct, truck, loaded);
  }
  const r = mine.routes[rk(shovelId, dumpId)] ?? DEFAULT_ROUTE;
  return travelTimeSec(r.distM, loaded ? r.gradePct : -r.gradePct, r.rrPct, truck, loaded);
}
