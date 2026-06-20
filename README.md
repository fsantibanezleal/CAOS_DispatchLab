# DispatchLab

A didactic, in-browser bench that compares **truck-to-shovel dispatch policies** on a deterministic
discrete-event simulation of an open pit, validated against closed-form match-factor and queueing theory.

**Live:** https://dispatchlab.fasl-work.com · part of the [Faena](https://faena.fasl-work.com) mining-analytics hub.

> A policy-comparison **sandbox**, not a production dispatch system (Modular DISPATCH, Wenco, MineStar) and
> not in-plant tracking. The mine is synthetic but physics-grounded; it has never been validated on a real
> mine, because no public ground-truthed cycle-log benchmark exists.

## What it does

Pick a case → pick a dispatch policy → run the simulation live and watch trucks cycle shovel → crusher →
shovel while the KPIs (tonnes, match factor, shovel utilisation, truck wait, crusher feed) update. The
decision panel diagnoses fleet balance (over/under-trucked + a fleet-sizing suggestion) and the bottleneck.

- **Deterministic DES core** — next-event-time-advance, an integer-tick clock and a `(time, priority, seq)`
  event key (bit-deterministic per engine), seedable `xoshiro128**` named streams (common random numbers
  across policies). Validated by a closed-form 1×1 oracle, a determinism test and the match-factor controls.
- **Truck kinematics** from rimpull/grade physics (total resistance = grade + rolling resistance), not a
  constant speed.
- **Dispatch policies** — fixed, greedy (earliest completion), shortest-expected-wait, and the two classic
  conflicting criteria (min-truck-wait vs min-shovel-wait). The exact OR policies (Hungarian, multi-stage
  LP, blend-MILP) and a reinforcement-learning policy build on this base.
- **Match factor** as the analytical ground truth, with the heterogeneous-fleet correction.

## Develop

```bash
npm install
npm run dev        # vite dev server
npm test           # DES determinism + oracle + match-factor tests
npm run build      # tsc + vite build
```

Stack: Vite + React 19 + TypeScript, uPlot, the shared `@fasl-work/caos-app-shell`. Deployed to GitHub
Pages. Bilingual (EN default + ES), light/dark.

## Honesty

Synthetic but physics-grounded; every run carries its seed; every approximate quantity is labelled
approximate. Policy rankings are case- and seed-specific — the bench reports distributions, never a single
overconfident winner. MIT licensed.
