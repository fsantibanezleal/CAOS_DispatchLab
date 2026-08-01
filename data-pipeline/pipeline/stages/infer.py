"""Stage 4, infer (heavy lane): run the learned policies in the DES (a synchronous TS forward of the weights) and via
onnxruntime-web for the decision-inspector, the offline mirror of the in-browser path. The learned policies are
loaded from dl-learned.json (weights) + the ONNX (canonical), produced by `pipeline/science/train_policy.py`."""
