"""Deterministic pseudo-randomness.

Every value is derived by hashing the run seed together with the coordinates of
the thing being generated, so a row's contents never depend on generation order,
batch boundaries, speed multiplier, or process restarts.
"""

from __future__ import annotations

from hashlib import blake2b
from typing import Sequence, TypeVar

T = TypeVar("T")

_DIGEST_BYTES = 8


def det_hash(seed: int, *parts: object) -> int:
    payload = "|".join([str(seed), *(str(part) for part in parts)]).encode("utf-8")
    return int.from_bytes(blake2b(payload, digest_size=_DIGEST_BYTES).digest(), "big")


def det_int(seed: int, *parts: object, low: int = 0, high: int = 100) -> int:
    """Uniform integer in [low, high]."""
    span = high - low + 1
    if span <= 0:
        raise ValueError("high must be >= low")
    return low + det_hash(seed, *parts) % span


def det_float(seed: int, *parts: object, low: float = 0.0, high: float = 1.0) -> float:
    unit = (det_hash(seed, *parts) % 1_000_000) / 1_000_000
    return low + unit * (high - low)


def det_choice(items: Sequence[T], seed: int, *parts: object) -> T:
    if not items:
        raise ValueError("items must not be empty")
    return items[det_hash(seed, *parts) % len(items)]


def det_weighted_choice(items: Sequence[tuple[T, int]], seed: int, *parts: object) -> T:
    total = sum(weight for _, weight in items)
    if total <= 0:
        raise ValueError("weights must sum to a positive number")
    target = det_hash(seed, *parts) % total
    cumulative = 0
    for item, weight in items:
        cumulative += weight
        if target < cumulative:
            return item
    return items[-1][0]


def stride_positions(total: int, wanted: int) -> list[bool]:
    """Spread ``wanted`` marks evenly across ``total`` slots.

    Used to place declines inside an hour so aggregate counts are exact while
    the events stay evenly distributed instead of clustering at the start.
    """
    if total <= 0 or wanted <= 0:
        return [False] * max(total, 0)
    if wanted >= total:
        return [True] * total
    marks: list[bool] = []
    for index in range(total):
        marks.append(((index + 1) * wanted) // total > (index * wanted) // total)
    return marks
