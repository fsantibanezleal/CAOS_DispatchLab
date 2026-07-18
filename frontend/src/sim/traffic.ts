// Shared haul-road traffic constants + helpers (#87). model.ts, the forkable rolloutSim.ts and the
// capacity oracle must use the same values, so the two sims stay byte-for-byte in parity and the
// oracle stays a valid upper bound (it has to respect the same posted speed limit the sim runs on).
export const SECURITY_M = 60;   // minimum spacing between consecutive trucks on a haul road (metres)
export const POSTED_KMH = 50;   // posted haul-road speed limit, independent of the truck's rimpull
export const MEETING_S = 20;    // passing-bay slowdown when meeting opposing traffic on a single lane

/** Travel time raised to respect the posted road speed limit: however capable the rimpull, no truck
 *  covers the leg faster than POSTED_KMH. Applied per leg in both sims and in the capacity oracle. */
export function speedLimitedSec(freeFlowTt: number, distM: number): number {
  return distM > 0 ? Math.max(freeFlowTt, distM / (POSTED_KMH / 3.6)) : freeFlowTt;
}
