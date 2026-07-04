// Hungarian (Kuhn–Munkres) assignment solver, the OR tier's core (#22). Pure TS, O(n^3),
// no dependencies. Solves min-cost assignment of workers (trucks) to tasks (shovel SLOTS);
// rectangular matrices are padded to square with a large-but-finite cost so extra workers get
// dummy tasks (never Infinity, it breaks the potentials).
//
// References (documented in docs/methodology): Kuhn 1955; Munkres 1957; the DISPATCH-style
// instantaneous optimal assignment baseline: White & Olson 1986; Alarie & Gamache 2002 (survey).

const BIG = 1e9;

/** Min-cost assignment. cost[i][j] = cost of worker i on task j. Returns task index per worker
 *  (-1 = assigned to padding / no real task). Deterministic. */
export function hungarian(cost: number[][]): number[] {
  const nR = cost.length;
  if (!nR) return [];
  const nC = Math.max(...cost.map((r) => r.length));
  const n = Math.max(nR, nC);
  // padded square matrix; finite BIG keeps potentials well-defined
  const a: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i < nR && j < (cost[i]?.length ?? 0) ? cost[i][j] : BIG)));

  // JV-style O(n^3) with row/col potentials (u, v) and matching on columns (p)
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);       // p[j] = row matched to column j (1-based)
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else { minv[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }

  const result = new Array(nR).fill(-1);
  for (let j = 1; j <= n; j++) {
    const i = p[j];
    if (i >= 1 && i <= nR && j <= nC && a[i - 1][j - 1] < BIG / 2) result[i - 1] = j - 1;
  }
  return result;
}

export interface FleetTruckView { id: number; readyInSec: number; atDumpId: number }

/** DISPATCH-style instantaneous assignment: trucks needing dispatch within the window are
 *  jointly assigned to shovel SLOTS (each shovel contributes k slots = successive service
 *  positions, each later slot costing one more load in queue-wait). costETA gives truck→shovel
 *  empty-travel seconds; freeInSec/loadMeanSec price the marginal wait per slot. */
export function assignFleet(
  trucks: FleetTruckView[],
  shovels: { id: number; freeInSec: number; loadMeanSec: number }[],
  etaSec: (truckIdx: number, shovelId: number) => number,
  slotsPerShovel = 2,
): Map<number, number> {
  const cols: { shovel: number; slot: number }[] = [];
  for (const s of shovels) for (let k = 0; k < slotsPerShovel; k++) cols.push({ shovel: s.id, slot: k });
  const cost = trucks.map((t, ti) => cols.map(({ shovel, slot }) => {
    const s = shovels.find((x) => x.id === shovel)!;
    const arrive = t.readyInSec + etaSec(ti, shovel);
    // service start estimate for slot k: max(arrival, shovel free) + k extra loads of queue
    const start = Math.max(arrive, s.freeInSec) + slot * s.loadMeanSec;
    return start + s.loadMeanSec;                        // completion-time objective
  }));
  const pick = hungarian(cost);
  const out = new Map<number, number>();
  trucks.forEach((t, ti) => {
    const j = pick[ti];
    if (j >= 0) out.set(t.id, cols[j].shovel);
  });
  return out;
}
