"""Synthetic data platform for the fintech Aura Analyst demo.

Two entry points share this package:

* the seeder and control CLI (``python -m fintech_demo ...``)
* the simulator leader process (``python -m fintech_demo run``)

Everything the package generates is synthetic. It contains no production data,
no real payment credentials, and no automated financial decisioning.
"""

from .config import FIXTURE_VERSION

__all__ = ["FIXTURE_VERSION"]
