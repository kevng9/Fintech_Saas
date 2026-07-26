"""Scenario registry.

Every anchor's named scenario registers here, so injection, idempotency,
verification, and reset behaviour in ``injection.py`` and ``verify.py`` work
identically for all eight without further changes to those modules.

Builders may return either ``Sequence[TableBatch]`` (every scenario should
prefer this) or a bare ``Sequence[tuple]`` of payment_event rows for backward
compatibility; :func:`build_rows` normalises either shape to
``list[TableBatch]`` so callers never branch on which form a builder chose.
"""

from __future__ import annotations

from typing import Callable, Sequence

from ..generator import PAYMENT_EVENT_COLUMNS, World
from . import (
    a1_review_spike,
    a2_processor_timeout,
    a3_loss_cluster,
    a4_correspondent_spike,
    a5_case_surge,
    a6_settlement_delay,
    a7_pending_exposure,
    a8_dining_spike,
)
from .base import ScenarioDefinition, TableBatch

BuildRows = Callable[[World, int, int], "Sequence[TableBatch] | Sequence[tuple]"]

_REGISTRY: dict[str, tuple[ScenarioDefinition, BuildRows]] = {
    a1_review_spike.SCENARIO_ID: (a1_review_spike.DEFINITION, a1_review_spike.build_rows),
    a2_processor_timeout.SCENARIO_ID: (
        a2_processor_timeout.DEFINITION,
        a2_processor_timeout.build_rows,
    ),
    a3_loss_cluster.SCENARIO_ID: (a3_loss_cluster.DEFINITION, a3_loss_cluster.build_rows),
    a4_correspondent_spike.SCENARIO_ID: (
        a4_correspondent_spike.DEFINITION,
        a4_correspondent_spike.build_rows,
    ),
    a5_case_surge.SCENARIO_ID: (a5_case_surge.DEFINITION, a5_case_surge.build_rows),
    a6_settlement_delay.SCENARIO_ID: (a6_settlement_delay.DEFINITION, a6_settlement_delay.build_rows),
    a7_pending_exposure.SCENARIO_ID: (a7_pending_exposure.DEFINITION, a7_pending_exposure.build_rows),
    a8_dining_spike.SCENARIO_ID: (a8_dining_spike.DEFINITION, a8_dining_spike.build_rows),
}


def all_definitions() -> list[ScenarioDefinition]:
    return [definition for definition, _ in _REGISTRY.values()]


def get_definition(scenario_id: str) -> ScenarioDefinition:
    if scenario_id not in _REGISTRY:
        raise KeyError(f"Unknown scenario: {scenario_id}")
    return _REGISTRY[scenario_id][0]


def normalize_batches(raw: Sequence) -> list[TableBatch]:
    """Coerce a builder's return value into ``list[TableBatch]``.

    A builder that already returns ``TableBatch`` rows passes through
    unchanged. One that still returns bare payment_event tuples (the original
    A2 contract) is wrapped in a single payment_event batch, so old and new
    builders can be mixed in the registry during migration.
    """
    items = list(raw)
    if not items or isinstance(items[0], TableBatch):
        return items
    return [TableBatch(table="payment_event", columns=PAYMENT_EVENT_COLUMNS, rows=items)]


def build_rows(scenario_id: str, world: World, run_id: int, start_minute: int) -> list[TableBatch]:
    if scenario_id not in _REGISTRY:
        raise KeyError(f"Unknown scenario: {scenario_id}")
    raw = _REGISTRY[scenario_id][1](world, run_id, start_minute)
    return normalize_batches(raw)


def rows_for_table(batches: Sequence[TableBatch], table: str) -> list[tuple]:
    """Flatten every row a scenario wrote for one table across its batches."""
    return [row for batch in batches for row in batch.rows if batch.table == table]


__all__ = [
    "ScenarioDefinition",
    "TableBatch",
    "all_definitions",
    "build_rows",
    "get_definition",
    "normalize_batches",
    "rows_for_table",
]
