// Operational dispatch constraints (#22 P3) — the physics real dispatch runs under. They are
// DATA on the case (additive, optional); the DES enforces them BEFORE the policy sees the state:
// infeasible shovels are filtered out of the ShovelView set, so EVERY policy respects them by
// construction. A policy that still returns an infeasible id gets re-assigned to the nearest
// feasible choice and the event is counted (surfaced in the UI as invalid choices).
import { type DispatchState, type ShovelView, type TruckUnit } from './types';

export interface OperationalConstraints {
  /** shovel id -> truck models it can load (absent = compatible with all). */
  compatibility?: Record<number, string[]>;
  /** hard cap on trucks committed to a shovel (queue + inbound + loading); absent = uncapped. */
  maxQueuePerShovel?: number;
  /** crusher acceptance cap [t/h] over the trailing hour; when exceeded, ore shovels pause. */
  crusherMaxTph?: number;
  /** shift breaks: no dispatch decisions START inside these windows [startSec, endSec). */
  breaks?: { startSec: number; endSec: number }[];
}

export interface ConstraintContext {
  now: number;
  truck: TruckUnit;
  crusherTphTrailing?: number;      // trailing-hour crusher feed rate, provided by the DES
}

/** The feasible subset of shovels for this decision. Deterministic; empty = caller must hold. */
export function feasibleShovels(
  views: ShovelView[], cons: OperationalConstraints | undefined, ctx: ConstraintContext,
): ShovelView[] {
  if (!cons) return views;
  return views.filter((v) => {
    const compat = cons.compatibility?.[v.id];
    if (compat && !compat.includes(ctx.truck.spec.model)) return false;
    if (cons.maxQueuePerShovel != null) {
      const committed = v.queueLen + v.inbound + (v.loading ? 1 : 0);
      if (committed >= cons.maxQueuePerShovel) return false;
    }
    if (cons.crusherMaxTph != null && ctx.crusherTphTrailing != null
        && v.spec.faceType === 'ore' && ctx.crusherTphTrailing >= cons.crusherMaxTph) return false;
    return true;
  });
}

/** Is `now` inside a shift break? (decisions made during a break are DELAYED to its end). */
export function inBreak(cons: OperationalConstraints | undefined, now: number): number | null {
  if (!cons?.breaks) return null;
  for (const b of cons.breaks) if (now >= b.startSec && now < b.endSec) return b.endSec;
  return null;
}

/** Re-assign an infeasible policy choice to the nearest feasible shovel (by empty travel). */
export function nearestFeasible(s: DispatchState, feasible: ShovelView[]): number {
  let best = feasible[0].id, bestT = Infinity;
  for (const v of feasible) {
    const t = s.travelEmptySec(v.id);
    if (t < bestT - 1e-9 || (Math.abs(t - bestT) <= 1e-9 && v.id < best)) { best = v.id; bestT = t; }
  }
  return best;
}
