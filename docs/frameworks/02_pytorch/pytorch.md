# PyTorch (`torch==2.12.1`, CPU)

**What:** trains the two learned dispatch policies on the logged DES decisions and exports them to ONNX.
**Why binding:** the learned tier (a single fast dispatcher recovered from data) is the SOTA complement to the
classical criteria. Training is tiny (small nets over a few tens of thousands of logged decisions, seconds on CPU),
no GPU.

**Lane:** offline only (`pipeline/science/train_policy.py`). Never shipped to the browser.

## Install

```
pip install torch==2.12.1 --index-url https://download.pytorch.org/whl/cpu
```
(or `./scripts/setup.sh --precompute`). Also needs Node 20+ for the DES dataset generator.

## Usage

```
./scripts/precompute.sh all --retrain   # node DES dataset -> train policies -> export ONNX + dl-learned.json -> re-bake
```

`train_policy.py` seeds `torch.manual_seed(0)` and calls `torch.onnx.export(..., opset_version=17)` for both policies,
writing `dl-policy.onnx` + `dl-bcbest.onnx` + `dl-learned.json`.

## Applying to other data

Re-run `--retrain` after extending the cases (more shovels/trucks), the generator logs a richer decision set and the
policies re-fit. The state encoding (`featOrder` in dl-learned.json) is the contract.
