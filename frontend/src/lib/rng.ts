// Deterministic, seedable PRNG for the DES, the determinism contract requires NO Math.random and a
// reproducible stream. xoshiro128** over Uint32 (not splitmix64→u64: JS float64 cannot represent u64
// exactly). Per-purpose, per-entity named streams (load/travel/dump/breakdown/tie-break) seeded by hashing
// (masterSeed, streamName) so adding a truck does not shift the draws feeding the others, this is what
// makes common-random-numbers policy comparisons valid (same arrivals/services across policies).

const rotl = (x: number, k: number): number => (((x << k) | (x >>> (32 - k))) >>> 0);

/** splitmix32, expands a 32-bit seed into a stream, used to fill the xoshiro state words. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** FNV-1a 32-bit hash of a stream name → combined with the master seed. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** One independent random stream (xoshiro128**) with the sampling kit the DES needs. */
export class Stream {
  private s0 = 0; private s1 = 0; private s2 = 0; private s3 = 0;
  private gaussSpare: number | null = null;

  constructor(seed: number) {
    const sm = splitmix32(seed >>> 0);
    this.s0 = sm(); this.s1 = sm(); this.s2 = sm(); this.s3 = sm();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1; // avoid the all-zero state
  }

  /** Deep copy of the stream's exact state (words + gauss spare); the rollout forks the DES and must
   *  carry the noise state so a forked future continues the same stream, not a fresh one. */
  clone(): Stream {
    const s = Object.create(Stream.prototype) as Stream;
    s.s0 = this.s0; s.s1 = this.s1; s.s2 = this.s2; s.s3 = this.s3; s.gaussSpare = this.gaussSpare;
    return s;
  }

  /** Reseed in place (used to draw an independent sampled future in a rollout branch). */
  reseed(seed: number): void {
    const sm = splitmix32(seed >>> 0);
    this.s0 = sm(); this.s1 = sm(); this.s2 = sm(); this.s3 = sm(); this.gaussSpare = null;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** raw uint32 */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7) >>> 0, 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0; this.s3 ^= this.s1; this.s1 ^= this.s2; this.s0 ^= this.s3;
    this.s2 ^= t; this.s3 = rotl(this.s3, 11);
    return result >>> 0;
  }

  /** uniform in [0,1) with 32-bit resolution */
  u(): number { return this.nextU32() / 4294967296; }

  /** uniform in [lo,hi) */
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.u(); }

  /** integer in [0,n) */
  int(n: number): number { return Math.floor(this.u() * n); }

  /** standard normal (Box–Muller, cached spare) */
  gauss(): number {
    if (this.gaussSpare !== null) { const g = this.gaussSpare; this.gaussSpare = null; return g; }
    let u = 0, v = 0;
    while (u === 0) u = this.u();
    while (v === 0) v = this.u();
    const r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * v;
    this.gaussSpare = r * Math.sin(a);
    return r * Math.cos(a);
  }

  /** exponential with the given mean (inverse-CDF; 1−u avoids log(0)) */
  exp(mean: number): number { return -mean * Math.log(1 - this.u()); }

  /** lognormal parameterised by its mean and coefficient of variation (cv = sd/mean) */
  lognormal(mean: number, cv: number): number {
    const sigma2 = Math.log(1 + cv * cv);
    const mu = Math.log(Math.max(mean, 1e-9)) - 0.5 * sigma2;
    return Math.exp(mu + Math.sqrt(sigma2) * this.gauss());
  }

  /** triangular(a, mode, b) */
  tri(a: number, mode: number, b: number): number {
    const u = this.u(), c = (mode - a) / Math.max(b - a, 1e-9);
    return u < c ? a + Math.sqrt(u * (b - a) * (mode - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - mode));
  }

  /** Erlang-k with the given total mean (sum of k exponentials each mean/k), shovel load time */
  erlang(k: number, mean: number): number {
    let s = 0; const m = mean / Math.max(k, 1);
    for (let i = 0; i < k; i++) s += this.exp(m);
    return s;
  }
}

/** A seeded family of independent NAMED streams. `rng.stream('load')` is stable across runs and across
 * fleet sizes (it does not consume from other streams). */
export class Rng {
  private cache = new Map<string, Stream>();
  constructor(private masterSeed: number) {}
  stream(name: string): Stream {
    let s = this.cache.get(name);
    if (!s) { s = new Stream((this.masterSeed ^ fnv1a(name)) >>> 0); this.cache.set(name, s); }
    return s;
  }

  /** Deep copy including every materialised stream's state (for the forkable rollout DES). */
  clone(): Rng {
    const r = new Rng(this.masterSeed);
    for (const [k, v] of this.cache) r.cache.set(k, v.clone());
    return r;
  }

  /** Reseed every materialised stream from a new master (independent sampled future in a rollout branch). */
  reseedAll(seed: number): void {
    this.masterSeed = seed >>> 0;
    for (const [k, v] of this.cache) v.reseed((this.masterSeed ^ fnv1a(k)) >>> 0);
  }
}
