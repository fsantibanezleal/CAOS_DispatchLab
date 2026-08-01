#!/usr/bin/env python3
"""Repo-local build tooling. Invoked BY PATH, never installed, never a distribution.

Per conventions/no-internal-packages.md: a product declares no package of its own. If a package is
required it is a separate repo with a valid PyPI project (see milldem, minehaulsim, oreblocks). This
folder bakes THIS product's own artifacts and nothing else, so it is scripts, not a package.

    python data-pipeline/run.py            # all cases
    python data-pipeline/run.py <CASE-ID>  # one case
"""
from pipeline.pipeline import main

if __name__ == "__main__":
    main()
