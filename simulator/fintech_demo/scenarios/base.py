"""Scenario contract.

A scenario owns a logical time window completely: while it is being injected,
baseline generation for the lanes it affects is suppressed, so background
events can never drift into the window the dashboard and tests measure.

Scenarios write to one or more tables. ``TableBatch`` is the unit a builder
returns per table so ``injection.py`` can insert every table atomically and
count rows per table, whether the scenario touches only ``payment_event``
(A2) or several fact tables at once (A1, A3-A8).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, Sequence

from ..generator import World
from ..rowbatch import TableBatch

__all__ = ["TableBatch", "ScenarioDefinition", "ScenarioBuilder"]


@dataclass(frozen=True)
class ScenarioDefinition:
    scenario_id: str
    anchor_id: str
    name: str
    description: str
    metric_window: str
    window_minutes: int
    expected_deltas: dict
    excluded_segment_keys: tuple[str, ...] = field(default=())
    # Tables this scenario's anchor owns, for baseline seed listing where a
    # generator needs to know what belongs to it. Empty for scenarios that
    # only rely on tables seeded elsewhere (A2 relies on payment_event, which
    # every anchor shares).
    seed_tables: tuple[str, ...] = field(default=())
    # When True, injection skips payment_event background generation entirely
    # for the scenario window. Default False keeps the shared logical clock
    # moving background payment traffic forward under every scenario, A2's
    # excluded_segment_keys included, so non-payment anchors (A1, A3-A8) still
    # see a live payment stream while their own tables are injected.
    suppress_payment_background: bool = False
    enabled: bool = True


class ScenarioBuilder(Protocol):
    definition: ScenarioDefinition

    def build_rows(self, world: World, run_id: int, start_minute: int) -> Sequence[TableBatch]:
        """Return one TableBatch per table this scenario writes for its window."""
