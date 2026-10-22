"""Generators that build deterministic baseline rows for every anchor.

``shared_dims`` fills the dimensions common to every anchor beyond A2 (spec
section 8.4). Each of ``a1_digital`` through ``a8_customer`` fills one
anchor's own fact tables the same way ``scenarios.a2_processor_timeout`` fills
``payment_event``: a pure function of the run seed, so the baseline is
identical every time it is generated. ``seed_all_baselines`` is the single
entry point ``seed.seed_anchor_baselines`` calls to collect every anchor's
baseline rows as ``TableBatch`` instances ready to insert.
"""

from __future__ import annotations

from ..generator import World
from ..rowbatch import TableBatch
from . import (
    a1_digital,
    a3_fraud,
    a4_aml,
    a5_disputes,
    a6_liquidity,
    a7_credit,
    a8_customer,
    shared_dims,
)

_BASELINE_MODULES = (a1_digital, a3_fraud, a4_aml, a5_disputes, a6_liquidity, a7_credit, a8_customer)

__all__ = [
    "a1_digital",
    "a3_fraud",
    "a4_aml",
    "a5_disputes",
    "a6_liquidity",
    "a7_credit",
    "a8_customer",
    "shared_dims",
    "seed_all_baselines",
]


def seed_all_baselines(world: World, run_id: int) -> list[TableBatch]:
    """Every A1/A3-A8 anchor's baseline rows, as one flat list of batches."""
    batches: list[TableBatch] = []
    for module in _BASELINE_MODULES:
        batches.extend(module.seed_baseline(world, run_id))
    return batches
