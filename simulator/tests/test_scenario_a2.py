"""The A2_PROCESSOR_TIMEOUT scenario must produce its published deltas exactly."""

from __future__ import annotations

from datetime import datetime

import pytest

from conftest import Columns, p95
from fintech_demo import scenarios
from fintech_demo.generator import SCENARIO_SEQUENCE_OFFSET, World
from fintech_demo.model import AFFECTED_SEGMENT, to_usd

EPOCH = datetime(2026, 7, 25, 9, 0, 0)
SEED = 20260725
SCENARIO_ID = "A2_PROCESSOR_TIMEOUT"


@pytest.fixture(scope="module")
def world() -> World:
    return World(SEED, EPOCH, baseline_days=1)


def _payment_rows(world: World, start_minute: int) -> list[tuple]:
    batches = scenarios.build_rows(SCENARIO_ID, world, run_id=1, start_minute=start_minute)
    return scenarios.rows_for_table(batches, "payment_event")


@pytest.fixture(scope="module")
def burst(world: World) -> list[tuple]:
    return _payment_rows(world, 1440)


def test_scenario_is_registered() -> None:
    definition = scenarios.get_definition(SCENARIO_ID)
    assert definition.anchor_id == "a2"
    assert definition.window_minutes == 2
    assert definition.excluded_segment_keys == (AFFECTED_SEGMENT.key,)


def test_burst_matches_published_counts(burst: list[tuple], column: Columns) -> None:
    expected = scenarios.get_definition(SCENARIO_ID).expected_deltas["after"]
    assert len(burst) == expected["attempts"]
    assert sum(column(row, "approved") for row in burst) == expected["approvals"]
    timeouts = sum(1 for row in burst if column(row, "response_code") == "TIMEOUT")
    assert timeouts == expected["timeout_declines"]


def test_burst_hits_the_published_rates(burst: list[tuple], column: Columns) -> None:
    definition = scenarios.get_definition(SCENARIO_ID)
    expected = definition.expected_deltas["after"]
    tolerance = definition.expected_deltas["tolerance"]
    approval_rate = sum(column(row, "approved") for row in burst) / len(burst)
    timeout_rate = (
        sum(1 for row in burst if column(row, "response_code") == "TIMEOUT") / len(burst)
    )
    assert abs(approval_rate - expected["approval_rate"]) <= tolerance["approval_rate"]
    assert (
        abs(timeout_rate - expected["timeout_decline_rate"])
        <= tolerance["timeout_decline_rate"]
    )
    assert p95([column(row, "latency_ms") for row in burst]) == expected["p95_latency_ms"]


def test_burst_stays_inside_the_affected_lane(burst: list[tuple], column: Columns) -> None:
    assert {column(row, "processor_id") for row in burst} == {AFFECTED_SEGMENT.processor_id}
    assert {column(row, "card_network") for row in burst} == {AFFECTED_SEGMENT.card_network}
    assert {column(row, "issuer_country") for row in burst} == {AFFECTED_SEGMENT.issuer_country}
    assert {column(row, "currency") for row in burst} == {"GBP"}


def test_burst_amounts_are_normalized_to_usd(burst: list[tuple], column: Columns) -> None:
    for row in burst:
        assert column(row, "amount_usd") == to_usd(column(row, "amount"), "GBP")


def test_every_burst_row_is_tagged(burst: list[tuple], column: Columns) -> None:
    assert all(column(row, "scenario_id") == SCENARIO_ID for row in burst)


def test_burst_is_deterministic(world: World, burst: list[tuple]) -> None:
    again = _payment_rows(world, 1440)
    assert burst == again


def test_burst_sequences_cannot_collide_with_background_events(
    world: World, burst: list[tuple], column: Columns
) -> None:
    background = world.generate_minute(1, 1440) + world.generate_minute(1, 1441)
    burst_sequences = {column(row, "sequence_no") for row in burst}
    background_sequences = {column(row, "sequence_no") for row in background}
    assert not burst_sequences & background_sequences
    assert all(sequence % 100_000 >= SCENARIO_SEQUENCE_OFFSET for sequence in burst_sequences)


def test_burst_fills_exactly_the_window(
    world: World, burst: list[tuple], column: Columns
) -> None:
    window_start = world.minute_start(1440)
    window_end = world.minute_start(1442)
    assert min(column(row, "event_time") for row in burst) >= window_start
    assert max(column(row, "event_time") for row in burst) < window_end


def test_background_generation_is_suppressed_for_the_affected_lane(
    world: World, column: Columns
) -> None:
    definition = scenarios.get_definition(SCENARIO_ID)
    rows = world.generate_minute(
        1, 1440, excluded_segment_keys=definition.excluded_segment_keys
    )
    lane = [
        row
        for row in rows
        if column(row, "processor_id") == AFFECTED_SEGMENT.processor_id
        and column(row, "card_network") == AFFECTED_SEGMENT.card_network
        and column(row, "issuer_country") == AFFECTED_SEGMENT.issuer_country
    ]
    assert lane == []
    assert rows, "other lanes must keep producing traffic during the burst"
