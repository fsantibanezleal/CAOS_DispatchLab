// Binary min-heap (flat-array) for the future-event list. Generic over a comparator that MUST impose a
// strict total order so simultaneous events never resolve by heap-internal accident (the determinism
// keystone is the (time, priority, seq) key in des.ts, not this structure).
export class MinHeap<T> {
  private a: T[] = [];
  constructor(private less: (x: T, y: T) => boolean) {}

  get size(): number { return this.a.length; }
  peek(): T | undefined { return this.a[0]; }

  push(v: T): void {
    const a = this.a; a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break;
    }
  }

  pop(): T | undefined {
    const a = this.a; if (a.length === 0) return undefined;
    const top = a[0], last = a.pop()!;
    if (a.length === 0) return top;
    a[0] = last;
    let i = 0; const n = a.length;
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < n && this.less(a[l], a[m])) m = l;
      if (r < n && this.less(a[r], a[m])) m = r;
      if (m === i) break;
      [a[i], a[m]] = [a[m], a[i]]; i = m;
    }
    return top;
  }
}
