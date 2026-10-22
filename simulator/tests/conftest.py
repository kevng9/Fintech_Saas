"""Shared test helpers.

Rows are emitted as positional tuples for fast batch inserts, so tests resolve
column offsets from ``PAYMENT_EVENT_COLUMNS`` instead of hardcoding integers.
Adding a column then cannot silently shift a test's assertions onto the wrong
field.
"""

from __future__ import annotations

import math
from typing import Sequence

import pytest

from fintech_demo.generator import PAYMENT_EVENT_COLUMNS


class Columns:
    def __init__(self, names: Sequence[str]) -> None:
        self._index = {name: position for position, name in enumerate(names)}

    def __call__(self, row: Sequence, name: str):
        return row[self._index[name]]

    def position(self, name: str) -> int:
        return self._index[name]


@pytest.fixture(scope="session")
def column() -> Columns:
    return Columns(PAYMENT_EVENT_COLUMNS)


def p95(values: Sequence[int]) -> int:
    """Nearest-rank p95, matching ``verify.exact_p95`` and the demo's SQL."""
    ordered = sorted(values)
    if not ordered:
        raise ValueError("p95 of an empty sample is undefined")
    rank = max(math.ceil(0.95 * len(ordered)), 1)
    return ordered[rank - 1]
