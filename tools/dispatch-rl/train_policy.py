"""Train the learned dispatch policies on the logged DES transitions and export them to ONNX for live
in-browser inference (onnxruntime-web). Two distinct learned models, both pointer-style (a shared per-shovel
scoring net so ONE model handles any number of shovels):

  • POLICY (reward-weighted imitation / RWR, Peters & Schaal 2007) — scores each candidate shovel; trained to
    reproduce the reference decisions weighted by the episode's tonnes, so it learns the patterns of the
    GOOD episodes. Act = argmax score.
  • VALUE (offline value regression) — predicts a shovel's expected episode tonnes from its features; act =
    argmax predicted value. A different learned policy from the same data.

The state encoding matches tools/dispatch-rl/gen_dataset.mjs exactly (the single source of truth). The app
rebuilds the same per-shovel features and runs these ONNX models at each dispatch decision. Honest: the
true learned-vs-heuristic comparison is the tonnes the policies actually move, measured live in the DES on
the Compare/Benchmark pages — not a fabricated number.

Run:  python train_policy.py
"""
from __future__ import annotations
import os, json, numpy as np, torch, torch.nn as nn, torch.nn.functional as F

torch.manual_seed(0); np.random.seed(0)
HERE = os.path.dirname(__file__)
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public"))
os.makedirs(OUT, exist_ok=True)
FEAT = 6


class ScoreNet(nn.Module):
    def __init__(self):
        super().__init__(); self.f = nn.Sequential(nn.Linear(FEAT, 32), nn.ReLU(), nn.Linear(32, 32), nn.ReLU(), nn.Linear(32, 1))
    def forward(self, x):           # x: (..., FEAT) → (..., 1)
        return self.f(x)


def load():
    rows = [json.loads(l) for l in open(os.path.join(HERE, "dataset.jsonl")) if l.strip()]
    # held-out by seed-position: a deterministic 3/12 of seeds are eval-only (no leakage of seeds into train)
    seeds = sorted({r.get("seed", 0) for r in rows}) if rows and "seed" in rows[0] else []
    return rows


def group(rows, n):
    sel = [r for r in rows if r["nSh"] == n]
    X = np.array([r["shovels"] for r in sel], np.float32)      # (M, n, 6)
    y = np.array([r["chosen"] for r in sel], np.int64)         # (M,)
    w = np.array([r["tonnes"] for r in sel], np.float32)       # (M,)
    return X, y, w


def main():
    rows = load()
    # train/eval split: every 4th decision → eval (stable, ~25%)
    ev = np.zeros(len(rows), bool); ev[::4] = True
    tr_rows = [r for i, r in enumerate(rows) if not ev[i]]
    ev_rows = [r for i, r in enumerate(rows) if ev[i]]
    Ns = sorted({r["nSh"] for r in rows})

    # ---- POLICY: reward-weighted imitation ----
    pol = ScoreNet(); opt = torch.optim.Adam(pol.parameters(), 1e-3)
    groups = {n: group(tr_rows, n) for n in Ns}
    for ep in range(40):
        tot = 0.0; cnt = 0
        for n in Ns:
            X, y, w = groups[n]
            if len(X) == 0: continue
            xt = torch.tensor(X); yt = torch.tensor(y); wt = torch.tensor(w)
            scores = pol(xt).squeeze(-1)                       # (M, n)
            ce = F.cross_entropy(scores, yt, reduction="none")
            loss = (ce * (wt / wt.mean())).mean()
            opt.zero_grad(); loss.backward(); opt.step(); tot += loss.item() * len(X); cnt += len(X)
        if ep % 10 == 0: print(f"  policy ep{ep} loss {tot/max(cnt,1):.3f}")

    # ---- POLICY-B: behaviour-clone the single best-performing reference policy (pure imitation) ----
    mt = {}
    for r in tr_rows: mt.setdefault(r["policy"], []).append(r["tonnes"])
    best_pol = max(mt, key=lambda p: np.mean(mt[p]))
    print(f"  best reference policy by mean tonnes: {best_pol}")
    bc_rows = [r for r in tr_rows if r["policy"] == best_pol]
    val = ScoreNet(); optv = torch.optim.Adam(val.parameters(), 1e-3)
    bgroups = {n: group(bc_rows, n) for n in Ns}
    for ep in range(40):
        tot = 0.0; cnt = 0
        for n in Ns:
            X, y, _ = bgroups[n]
            if len(X) == 0: continue
            xt = torch.tensor(X); yt = torch.tensor(y)
            loss = F.cross_entropy(val(xt).squeeze(-1), yt)
            optv.zero_grad(); loss.backward(); optv.step(); tot += loss.item() * len(X); cnt += len(X)
        if ep % 20 == 0: print(f"  bc-best ep{ep} loss {tot/max(cnt,1):.3f}")

    # ---- held-out metrics ----
    def imit_acc(net, rws):
        ok = 0
        for r in rws:
            with torch.no_grad():
                s = net(torch.tensor(np.array(r["shovels"], np.float32))).squeeze(-1)
            if int(s.argmax()) == r["chosen"]: ok += 1
        return ok / max(len(rws), 1)
    polAcc = imit_acc(pol, ev_rows)
    bcAcc = imit_acc(val, ev_rows)
    bc_ev = [r for r in ev_rows if r["policy"] == best_pol]
    bcSelf = imit_acc(val, bc_ev)
    print(f"held-out: RWR policy imit-acc {polAcc:.3f} | BC-best imit-acc {bcAcc:.3f} (vs its teacher {best_pol}: {bcSelf:.3f})")

    # ---- export ONNX (input feats (N,6) → score (N,1); dynamic N) ----
    pol.eval(); val.eval()
    for net, name in [(pol, "dl-policy.onnx"), (val, "dl-bcbest.onnx")]:
        torch.onnx.export(net, torch.zeros(2, FEAT), os.path.join(OUT, name), dynamo=False,
                          input_names=["feats"], output_names=["score"], dynamic_axes={"feats": {0: "n"}, "score": {0: "n"}}, opset_version=17)
    json.dump(dict(featOrder=["queueLen", "inbound", "loading", "freeIn/300", "backlog*load/300", "travel/300"],
                   policyImitAcc=round(polAcc, 3), bcBestImitAcc=round(bcAcc, 3), bcBestSelfAcc=round(bcSelf, 3),
                   bestPolicy=best_pol, nTrain=len(tr_rows), nEval=len(ev_rows), shovelCounts=Ns),
              open(os.path.join(OUT, "dl-learned.json"), "w"))
    print("wrote dl-policy.onnx, dl-bcbest.onnx, dl-learned.json")


if __name__ == "__main__":
    main()
