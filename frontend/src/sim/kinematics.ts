// Haul-truck kinematics from first principles, segment travel time comes from the rimpull/grade physics,
// not a guessed constant. Total resistance TR% = grade% + rolling-resistance%; the tractive force to
// overcome it is F = (TR/100)·GMW·g, and the engine-power-limited equilibrium speed is v = η·P/F, capped by
// the governed top speed. Downhill the truck is retarder-limited (a governed descent cap), not power-limited.
// Anchors (manufacturer handbooks; corrected during adversarial review): CAT 793F ≈ 218 t payload, ~166 t
// empty, C175-16 ≈ 1976 kW, ~60 km/h governed; Komatsu 930E ≈ 290 t payload for the mixed-fleet case.

const G = 9.81;          // m/s²
const ETA = 0.85;        // drivetrain efficiency (engine → rimpull)

export interface TruckSpec {
  model: string;
  payloadT: number;      // rated payload (t)
  tareT: number;         // empty operating weight (t)
  powerKW: number;       // net engine power
  maxSpeedKmh: number;   // governed top speed
  descentCapKmh?: number; // retarder-limited descent speed (defaults to 0.7·maxSpeed)
}

/** Equilibrium travel speed (km/h) of a truck on a segment of the given grade + rolling resistance. */
export function speedKmh(truck: TruckSpec, gradePct: number, rrPct: number, loaded: boolean): number {
  const massT = truck.tareT + (loaded ? truck.payloadT : 0);
  const massKg = massT * 1000;
  const trPct = gradePct + rrPct;                       // total resistance (%)
  const descentCap = truck.descentCapKmh ?? truck.maxSpeedKmh * 0.7;
  if (trPct <= 0) {
    // net downhill / negligible resistance → governed; steep downhill is retarder-limited
    const steepness = -trPct;                           // how strongly downhill (incl. RR credit)
    return steepness > 6 ? descentCap : truck.maxSpeedKmh;
  }
  const fReq = (trPct / 100) * massKg * G;              // N to hold/climb the grade
  const vMs = (ETA * truck.powerKW * 1000) / fReq;      // power-limited equilibrium speed (m/s)
  const vKmh = vMs * 3.6;
  return Math.min(truck.maxSpeedKmh, vKmh);
}

/** Travel time (s) for one segment. */
export function travelTimeSec(distanceM: number, gradePct: number, rrPct: number, truck: TruckSpec, loaded: boolean): number {
  const v = Math.max(2, speedKmh(truck, gradePct, rrPct, loaded));   // floor 2 km/h (crawl) avoids /0
  return distanceM / (v / 3.6);
}

export const TRUCKS: Record<string, TruckSpec> = {
  '793F': { model: 'CAT 793F', payloadT: 218, tareT: 166, powerKW: 1976, maxSpeedKmh: 60 },
  '930E': { model: 'Komatsu 930E', payloadT: 290, tareT: 200, powerKW: 2014, maxSpeedKmh: 64 },
};
