"""The row-batch unit shared by ``generators`` and ``scenarios``.

``TableBatch`` used to live in ``scenarios/base.py``. It moved here, to a leaf
module with no package-level dependents, so anchor generators (``generators/a1_digital.py``
and friends) can build baseline rows for their own tables without importing
anything from the ``scenarios`` package: generators are baseline-only and
should never need scenario definitions, and importing across those two
packages in either direction risks a circular import once both sides grow to
cover every anchor. ``scenarios/base.py`` re-exports this class so existing
``from .base import TableBatch`` imports keep working unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class TableBatch:
    """Rows a generator or scenario writes into one table."""

    table: str
    columns: tuple[str, ...]
    rows: Sequence[tuple]

    def __len__(self) -> int:
        return len(self.rows)


__all__ = ["TableBatch"]
