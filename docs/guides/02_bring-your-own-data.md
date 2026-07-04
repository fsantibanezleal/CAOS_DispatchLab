# 02, Bring your own pit scenario

DispatchLab is not limited to the 8 baked cases, Contract 1 is the gate that lets it evaluate a NEW pit.

## 1. Describe the scenario (Contract 1)

A scenario needs: `case_id`, `n_shovels` ([1,40]), `n_trucks` ([1,400]), `truck_model` ∈ {793F, 789D, 777G},
`shift_sec` ([600,86400]). See `data/examples/scenarios.csv` for passing rows.

```python
from dlab.io.contract import validate_records
rep = validate_records([{ "case_id": "mine", "n_shovels": 3, "n_trucks": 12,
                          "truck_model": "793F", "shift_sec": 28800 }])
print(rep.summary())   # accepted / rejected (with reason) / flagged
```

A bad model / 0 shovels / non-numeric / too-short shift is **rejected with a reason**; a severely over/under-trucked
fleet (match factor far from 1) is **flagged** (dispatch barely matters / queues dominate).

## 2. Evaluate it

Live: the browser's TS DES runs any of the 8 policies over the scenario (pit map + KPIs + the Pareto comparison).
Offline: add the scenario to `src/sim/cases.ts` and re-run `--retrain` (or `bake_cases.mjs`) to bake its comparison.
The honesty caveat stands, the DES is a deterministic simulation, not a real fleet (see `docs/cases/README.md`).
