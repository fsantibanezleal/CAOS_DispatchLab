#!/usr/bin/env python3
"""Regenerate the figures for the DispatchLab dispatch-policy bench report from the COMMITTED artifacts. Two figures:

  fig-policies.pdf - (a) the six dispatch policies ranked by mean production (percent of the best) with median
                     truck wait; (b) the per-case best-minus-worst production gain, showing how much dispatch
                     matters across the eight cases.
  fig-learned.pdf  - the learned dispatchers' imitation accuracy of the best classical policy: a linear policy
                     network, behaviour cloning, and a Monte-Carlo rollout dispatcher.

Run:  python make_figs.py     (from repo root)
Deps: matplotlib, numpy.
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DER = ROOT / "data" / "derived"
DATA = HERE.parent / "data"

INK = "#1a1a2e"
GRID = "#d8d8e0"

plt.rcParams.update({
    "font.family": "serif", "font.size": 9.4, "axes.edgecolor": INK,
    "axes.labelcolor": INK, "text.color": INK, "xtick.color": INK, "ytick.color": INK,
    "axes.linewidth": 0.8, "figure.dpi": 200,
})


def fig_policies():
    d = json.loads((DATA / "bench.json").read_text(encoding="utf-8"))
    pol = d["policies"]
    best = max(p["tonnes"] for p in pol)
    names = [p["id"] for p in pol]
    pct = [100 * p["tonnes"] / best for p in pol]
    wait = [p["wait"] for p in pol]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(7.0, 3.1), gridspec_kw={"width_ratios": [1.1, 1]})

    y = np.arange(len(pol))
    cols = ["#1b6ca8" if n == "hungarian" else ("#b23a48" if n == "fixed" else "#7d99b0") for n in names]
    a1.barh(y, pct, color=cols, edgecolor=INK, linewidth=0.5, height=0.66, zorder=3)
    for yi, p, w in zip(y, pct, wait):
        a1.text(p - 0.3, yi, f"{p:.1f}%", va="center", ha="right", fontsize=7.2, color="white", fontweight="bold")
        a1.text(100.4, yi, f"wait {w:.0f}h", va="center", ha="left", fontsize=6.8, color="#555")
    a1.set_yticks(y); a1.set_yticklabels(names, fontsize=7.8)
    a1.set_xlim(94, 101.5)
    a1.set_xlabel("mean production (% of best policy)")
    a1.set_title("(a) dispatch-policy ranking\n(mean over 8 cases, 10 seeds)", fontsize=8.4)
    a1.grid(axis="x", color=GRID, linewidth=0.7, zorder=0)
    a1.set_axisbelow(True)
    a1.invert_yaxis()
    for s in ("top", "right"):
        a1.spines[s].set_visible(False)

    # (b) per-case best-minus-worst gain
    cases = d["cases"]
    cids = sorted(cases.keys())
    gains = []
    for c in cids:
        ts = [v["t"] for v in cases[c].values()]
        gains.append(100 * (max(ts) / min(ts) - 1))
    a2.bar(range(len(cids)), gains, color="#3fa34d", edgecolor=INK, linewidth=0.6, width=0.66, zorder=3)
    for i, g in enumerate(gains):
        a2.text(i, g + 0.15, f"{g:.1f}", ha="center", va="bottom", fontsize=6.8)
    a2.set_xticks(range(len(cids))); a2.set_xticklabels(cids, rotation=40, ha="right", fontsize=7.0)
    a2.set_ylabel("best - worst production (%)")
    a2.set_title("(b) how much dispatch matters,\nper case", fontsize=8.4)
    a2.grid(axis="y", color=GRID, linewidth=0.7, zorder=0)
    a2.set_axisbelow(True)
    for s in ("top", "right"):
        a2.spines[s].set_visible(False)

    fig.tight_layout()
    fig.savefig(HERE / "fig-policies.pdf", bbox_inches="tight")
    plt.close(fig)


def fig_learned():
    dl = json.loads((DER / "dl-learned.json").read_text(encoding="utf-8"))
    labels = ["linear policy\nnetwork", "behaviour\ncloning", "Monte-Carlo\nrollout"]
    accs = [dl["policyImitAcc"], dl["bcBestImitAcc"], dl["rolloutImitAcc"]]
    fig, ax = plt.subplots(figsize=(4.6, 3.0))
    cols = ["#7d99b0", "#7d99b0", "#e07a3f"]
    bars = ax.bar(range(3), accs, color=cols, edgecolor=INK, linewidth=0.6, width=0.62, zorder=3)
    for i, a in enumerate(accs):
        ax.text(i, a + 0.008, f"{a:.3f}", ha="center", va="bottom", fontsize=8.4, fontweight="bold")
    ax.axhline(1 / 3, color="#999", linewidth=0.9, linestyle="--", label="chance (3 shovels)")
    ax.set_xticks(range(3)); ax.set_xticklabels(labels, fontsize=8.0)
    ax.set_ylabel("imitation accuracy of best policy")
    ax.set_ylim(0, 1.0)
    ax.set_title(f"Learning the dispatch: rollout imitates\nthe best policy ('{dl['bestPolicy']}') best",
                 fontsize=8.8)
    ax.grid(axis="y", color=GRID, linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    ax.legend(fontsize=7.6, frameon=True, facecolor="white", edgecolor=GRID, loc="lower right")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    fig.tight_layout()
    fig.savefig(HERE / "fig-learned.pdf", bbox_inches="tight")
    plt.close(fig)


def main():
    fig_policies()
    fig_learned()
    print("wrote fig-policies.pdf, fig-learned.pdf")


if __name__ == "__main__":
    main()
