"""Determinism and exact-metric tests for the synthetic generator.

These run without a database. They prove the properties the demo contract
depends on: identical output for a given logical minute, exact per-hour
percentages, and a p95 that lands on a documented value rather than near it.
"""

from __future__ import annotations

from datetime import datetime

import pytest

from conftest import Columns, p95
from fintech_demo.generator import SEQUENCE_STRIDE, World
from fintech_demo.model import (
    AFFECTED_SEGMENT,
    CURRENCY_BY_COUNTRY,
    HOUR_SHAPE,
    SEGMENTS,
    to_usd,
)

EPOCH = datetime(2026, 7, 25, 9, 0, 0)
SEED = 20260725


@pytest.fixture(scope="module")
def world() -> World:
    return World(SEED, EPOCH, baseline_days=1)


def rows_for_hour(world: World, hour_index: int) -> list[tuple]:
    rows: list[tuple] = []
    for minute in range(60):
        rows.extend(world.generate_minute(1, hour_index * 60 + minute))
    return rows


def test_generate_minute_is_deterministic(world: World) -> None:
    first = world.generate_minute(1, 615)
    second = world.generate_minute(1, 615)
    assert first == second


def test_generate_minute_is_independent_of_neighbouring_minutes(world: World) -> None:
    direct = world.generate_minute(1, 900)
    after_walking_forward = None
    for minute in range(895, 901):
        after_walking_forward = world.generate_minute(1, minute)
    assert direct == after_walking_forward


def test_run_id_only_changes_identifiers(world: World, column: Columns) -> None:
    run_one = world.generate_minute(1, 120)
    run_two = world.generate_minute(2, 120)
    assert len(run_one) == len(run_two)
    for a, b in zip(run_one, run_two):
        assert column(a, "payment_id") != column(b, "payment_id")
        for field in ("sequence_no", "event_time", "response_code", "latency_ms", "amount_usd"):
            assert column(a, field) == column(b, field)


def test_minute_slices_sum_to_the_hour_quota(world: World) -> None:
    hour_index = 14
    rows = rows_for_hour(world, hour_index)
    hour_of_day = world.minute_start(hour_index * 60).hour
    expected = sum(segment.attempts_for_hour(hour_of_day) for segment in SEGMENTS)
    assert len(rows) == expected


def test_sequence_numbers_are_unique_and_ordered_by_minute(
    world: World, column: Columns
) -> None:
    sequences = [column(row, "sequence_no") for row in rows_for_hour(world, 3)]
    assert len(sequences) == len(set(sequences))
    assert all(seq < (3 * 60 + 60) * SEQUENCE_STRIDE for seq in sequences)


@pytest.mark.parametrize("hour_index", [0, 7, 11, 16, 23])
def test_each_segment_hour_hits_its_documented_rates(
    world: World, column: Columns, hour_index: int
) -> None:
    rows = rows_for_hour(world, hour_index)
    for segment in SEGMENTS:
        lane = [
            row
            for row in rows
            if column(row, "processor_id") == segment.processor_id
            and column(row, "card_network") == segment.card_network
            and column(row, "issuer_country") == segment.issuer_country
        ]
        attempts = len(lane)
        assert attempts == segment.attempts_for_hour(world.minute_start(hour_index * 60).hour)
        approvals = sum(column(row, "approved") for row in lane)
        timeouts = sum(1 for row in lane if column(row, "response_code") == "TIMEOUT")
        assert approvals / attempts == pytest.approx(segment.approval_rate, abs=1e-12)
        assert timeouts / attempts == pytest.approx(0.01, abs=1e-12)
        assert p95([column(row, "latency_ms") for row in lane]) == segment.tail_latency_ms


def test_affected_lane_baseline_matches_the_published_contract(column: Columns) -> None:
    world = World(SEED, EPOCH, baseline_days=1)
    lane: list[tuple] = []
    for minute in range(world.baseline_minutes):
        lane.extend(
            row
            for row in world.generate_minute(1, minute)
            if column(row, "processor_id") == AFFECTED_SEGMENT.processor_id
            and column(row, "card_network") == AFFECTED_SEGMENT.card_network
            and column(row, "issuer_country") == AFFECTED_SEGMENT.issuer_country
        )
    attempts = len(lane)
    approvals = sum(column(row, "approved") for row in lane)
    timeouts = sum(1 for row in lane if column(row, "response_code") == "TIMEOUT")
    assert approvals / attempts == pytest.approx(0.96, abs=1e-12)
    assert timeouts / attempts == pytest.approx(0.01, abs=1e-12)
    assert p95([column(row, "latency_ms") for row in lane]) == 180


def test_baseline_rows_carry_no_scenario_tag(world: World, column: Columns) -> None:
    assert all(column(row, "scenario_id") is None for row in world.generate_minute(1, 42))


def test_amounts_are_normalized_to_usd(world: World, column: Columns) -> None:
    """Value widgets sum across currencies, so every row carries a USD amount."""
    rows = rows_for_hour(world, 12)
    assert rows
    for row in rows:
        currency = column(row, "currency")
        country = column(row, "issuer_country")
        assert currency == CURRENCY_BY_COUNTRY[country]
        assert column(row, "amount_usd") == to_usd(column(row, "amount"), currency)
    # A non-USD lane must actually be converted, otherwise the helper is a no-op.
    non_usd = [row for row in rows if column(row, "currency") != "USD"]
    assert non_usd
    assert any(column(row, "amount_usd") != column(row, "amount") for row in non_usd)


def test_hour_shape_keeps_attempts_a_multiple_of_one_hundred() -> None:
    for shape in HOUR_SHAPE:
        for segment in SEGMENTS:
            attempts = segment.base_hundreds * shape * 100
            assert attempts % 100 == 0
            assert (attempts * segment.approval_rate).is_integer()
