# Method, look-ahead & rollout (the beyond-SOTA dispatcher)

**What:** a receding-horizon Monte-Carlo **rollout** dispatcher that attacks the one axis every other tier in
DispatchLab lacks, **non-myopia**. Greedy, shortest-wait, the two conflicting criteria, the OR/Hungarian joint
assignment and the two learned nets all decide on the *instantaneous* state. The rollout simulates the
downstream consequences of each candidate assignment and picks the one that optimises the simulated objective.
It is the most defensible beyond-SOTA claim available because it comes with a theorem, not a hope.

![Rollout: fork the DES at a decision, simulate K futures per candidate under the base policy, choose argmax Q](assets/rollout-tree.svg)

## The method

At each dispatch decision (state `s`, the truck that just dumped), for every feasible candidate shovel `a`:

1. **fork** the discrete-event simulation at its exact current state (`sim/rolloutSim.ts`, a closure-free,
   structured-clonable re-implementation of the live `model.ts` cycle),
2. apply `a`,
3. simulate the rest of the horizon `K` times under a fixed **base policy** `pi` (the best myopic heuristic,
   `shortestWait`),
4. score `a` by the mean simulated objective and choose the argmax.

$$ Q_\pi(s,a) = g(s,a) + J_\pi\big(f(s,a)\big), \qquad \tilde\pi(s) = \arg\max_{a \in A(s)} Q_\pi(s,a) $$

where `f(s,a)` is the successor state, `g` the immediate reward (tonnes), and `J_\pi` the base policy's return
from `f(s,a)`. This is exactly **one policy-improvement step** over the base heuristic
(Bertsekas, Tsitsiklis & Wu 1997, DOI `10.1023/A:1009635226865`).

### The improvement bound (the whole point)

On the **deterministic** model, with a base policy that is a fixed function of state (sequentially consistent),
the one-step rollout is provably no worse than its base:

$$ J_{\tilde\pi}(s) \ \ge\ J_\pi(s) \qquad \forall s. $$

So it **cannot lose to its own base on-bench**, and any win is real search, not a tuned coincidence. This is a
categorically stronger honesty position than behaviour cloning (which only matches) or from-scratch RL (which
can silently overfit the eval instance). Asserted as a hard test in `frontend/test/cases23.test.ts`
("rollout is NEVER worse than its base on the deterministic model").

### Stochastic variant + the certainty-equivalent planner

Under cycle-time uncertainty (the complex stochastic cases C04-C08) the rollout samples `K` noise realizations per candidate and
estimates the **expected** objective (the stochastic-scheduling rollout, Bertsekas & Castanon 1999,
DOI `10.1023/A:1009634810396`); the guarantee weakens to empirical-with-CI. Two practical guards make the
shipped policy robust:

* **Certainty-equivalent (mean) planner.** Naive `K`-sample forking has a subtle failure: once a forced action
  perturbs the event order, the common-random-numbers coupling between candidate branches desynchronizes, so the
  candidate comparison is dominated by sampling variance and the rollout *underperforms* its base. Planning each
  branch on the deterministic **mean** model (zero sampling variance) while ACTING in the noisy world is the
  measured-better variant (a genuine finding, `science/rollout_bench.mjs`). The `sample` planner is retained and
  exposed in the App's Rollout inspector to make the variance visible.
* **Switching margin.** Deviate from the base action only when a candidate beats the base action's simulated
  objective by more than a relative margin (`0.4%`); otherwise follow the base. This makes the rollout reduce to
  its base when the look-ahead sees no robust gain, so it never trades a knife-edge simulated tie for a loss in
  the realized world.

## The honest result (measured, not asserted)

Run `node --import tsx data-pipeline/dlab/science/rollout_bench.mjs` (leakage-safe: disjoint train vs eval seed
banks, Monte-Carlo 95% CIs, the eval bank disjoint from `bench_synthetic`'s). Result on this corpus:

* **Deterministic model, exact improvement bound.** The rollout is `>=` its base on every case. A **real** gain
  appears only on the asymmetric **C05 (~6% tonnes)**, where the horizon view avoids committing trucks to the
  far shovel that would starve the near one; small gains on C11/C16 (~0.5%). The negative controls
  **C01/C04/C12 tie exactly** (a win there would mean the eval is leaking, and fails the build).
* **Under cycle-time uncertainty, honest NULL.** The certainty-equivalent rollout does **not** beat myopic
  assignment: the base heuristic is already within a few percent of the capacity oracle, and the deterministic
  look-ahead edge is fragile to noise. The beyond-SOTA WIN condition (beat BOTH best-heuristic AND Hungarian
  outside the CI on `>= 3` target cases) is **not met**. This is exactly the falsifier the depth research
  anticipated: *horizon rollout buys ~0 for homogeneous fleets; myopic assignment is within a few percent of a
  full look-ahead on this corpus.* The **validated** contribution is the exact deterministic policy-improvement
  bound plus the real C05 gain, shipped honestly alongside the null, never a fabricated win.

## Live: AlphaGo-style distillation

The true rollout (`K x horizon` DES steps per decision) is too heavy for the browser. So it runs offline over
the corpus and its chosen actions are **distilled** into a small per-shovel MLP,
`dl-rollout.onnx` (`science/train_policy.py`, behaviour-clone of the rollout action, held-out imitation accuracy
`~0.84`), run live via `onnxruntime-web` exactly like the RWR/BC nets. The App's **Rollout inspector** panel
runs a BOUNDED rollout on demand (small `K`, one decision, never on autoplay) to show the `K` simulated futures
per candidate and the chosen action vs the base. The Benchmark's **Rollout** tab shows the true offline numbers.

## Data contract + outliers

* The rollout consumes the SAME `DispatchState` every policy sees; `rolloutSim.ts` is validated **byte-for-byte**
  against `model.ts` on the deterministic corpus (parity test), so the look-ahead is the same physics, not a
  rigged surrogate. If parity ever breaks, the improvement numbers are meaningless, so the parity assert gates.
* Distillation fidelity is bounded: if the ONNX cannot reproduce the rollout action distribution, the live net
  falls back toward the base. The held-out imitation accuracy is reported in `dl-learned.json`
  (`rolloutImitAcc`); the honest offline result is the authority, the live net is a fast approximation.

## Why BC, and why not (yet) offline RL

The learned tier clones behaviour; the natural successor is offline RL on the logged decision stream
(CQL, arXiv:2006.04779; IQL, arXiv:2110.06169), which can in principle beat the best heuristic instead of
matching it. It is not shipped: no improvement guarantee and overclaim-prone on the eval instance. The rollout
comes with a theorem, so it is the beyond-SOTA bet first.

## References (DOI-verified; see `frontend/src/data/citations.ts`)

* Bertsekas, Tsitsiklis & Wu (1997). Rollout algorithms for combinatorial optimization. *J. Heuristics* 3(3),
  245-262. DOI `10.1023/A:1009635226865`.
* Bertsekas & Castanon (1999). Rollout algorithms for stochastic scheduling problems. *J. Heuristics* 5(1),
  89-108. DOI `10.1023/A:1009634810396`.
* Seiler, Palmer & Hill (2022). Flow-achieving online planning and dispatching. *IEEE T-ASE* 19(1), 457-472.
  DOI `10.1109/TASE.2020.3039908`.
* White & Olson (1986). Computer-based dispatching in mines with concurrent operating objectives.
  *Mining Engineering* 38(11), 1045-1054 (pre-DOI print; venue+pages only).
* Alarie & Gamache (2002). Overview of solution strategies used in truck dispatching systems.
  *Int. J. Surface Mining Reclam. Environ.* 16(1), 59-76. DOI `10.1076/ijsm.16.1.59.3408`.
* RL frontier (context, we ship distilled rollout, not a from-scratch RL claim): Banerjee, Nguyen & Fookes
  (2025) Mining-Gym, arXiv:2503.19195; Meng, Tian & Zhang (2025) curriculum-PPO, arXiv:2502.20845; Zhang et al.
  (2020) heterogeneous-fleet multi-agent DRL, DOI `10.1109/BigData50022.2020.9378191`.
