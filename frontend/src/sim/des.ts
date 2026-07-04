// Deterministic discrete-event simulation executive (next-event-time-advance). The clock is an INTEGER
// tick counter (centiseconds) so time arithmetic is bit-exact across JS engines; durations are sampled in
// continuous seconds then rounded to ticks AT schedule() time, which absorbs the last-ULP differences of
// transcendental sampling (exp/log) that would otherwise diverge a trace across browsers. Event order is a
// strict total order (timeTick, priority, seq), seq, a monotonic counter, is the determinism keystone:
// without it, simultaneous events would resolve by heap-internal accident.
import { MinHeap } from './heap';

export const TICKS_PER_SEC = 100; // centisecond clock
export const toTicks = (sec: number): number => Math.max(0, Math.round(sec * TICKS_PER_SEC));
export const toSec = (ticks: number): number => ticks / TICKS_PER_SEC;

interface Event { timeTick: number; priority: number; seq: number; cb: () => void; }

/** Lower priority value fires first at equal time (e.g. resource releases before new arrivals if desired). */
export class Sim {
  private fel: MinHeap<Event>;
  private seq = 0;
  private _now = 0; // current tick
  private stopAt = Infinity;

  constructor() {
    this.fel = new MinHeap<Event>((x, y) =>
      x.timeTick !== y.timeTick ? x.timeTick < y.timeTick
      : x.priority !== y.priority ? x.priority < y.priority
      : x.seq < y.seq);
  }

  /** current simulated time in seconds */
  now(): number { return toSec(this._now); }
  nowTick(): number { return this._now; }

  /** schedule cb after `delaySec` (rounded to ticks now, so the trace is engine-stable) */
  schedule(delaySec: number, cb: () => void, priority = 1): void {
    const t = this._now + toTicks(delaySec);
    this.fel.push({ timeTick: t, priority, seq: this.seq++, cb });
  }

  /** schedule at an absolute tick (for exact, pre-rounded events) */
  scheduleAtTick(tick: number, cb: () => void, priority = 1): void {
    this.fel.push({ timeTick: Math.max(tick, this._now), priority, seq: this.seq++, cb });
  }

  /** run until the FEL drains or simulated time reaches `untilSec` (shift end) */
  run(untilSec = Infinity): void {
    this.stopAt = untilSec === Infinity ? Infinity : toTicks(untilSec);
    for (;;) {
      const e = this.fel.peek();
      if (!e || e.timeTick > this.stopAt) break;
      this.fel.pop();
      this._now = e.timeTick;
      e.cb();
    }
    if (this.stopAt !== Infinity) this._now = this.stopAt;
  }
}
