# 03 — GPU lane (DORMANT)

This solution does not require a GPU at the moment. DispatchLab's policy training is tiny (small nets over a few tens
of thousands of logged DES decisions, seconds on CPU). `requirements-gpu.txt` is a dormant placeholder.

Activate only if a future heavy increment (a much larger decision set or a deep RL policy) makes training slow:
install the CUDA torch build, document the pin in `requirements-gpu.txt` + this guide, and keep the CPU path as the
default reproducible lane.
