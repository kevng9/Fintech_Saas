#!/usr/bin/env python3
"""Generate reviewed Analyst fixtures for A2 from the deterministic generator.

Fixtures are the demo's fallback when Aura Analyst is unreachable, so a fixture
whose numbers disagree with the dashboard is worse than no fixture at all. Rather
than hand-writing plausible values, this script computes them with the same
generator that produces the rows in SingleStore, for both the baseline state and
the state after A2_PROCESSOR_TIMEOUT has been injected.

    python scripts/build_fixtures.py            # write fixtures/analyst/a2/*.json
    python scripts/build_fixtures.py --check     # fail if the files are stale

Re-run this whenever the generator, the segment table, or the scenario changes.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "simulator"))

from fintech_demo import scenarios  # noqa: E402
from fintech_demo.config import settings_from_env  # noqa: E402
from fintech_demo.generator import PAYMENT_EVENT_COLUMNS, World  # noqa: E402
from fintech_demo.model import PROCESSORS  # noqa: E402

OUTPUT_DIR = REPO_ROOT / "fixtures" / "analyst" / "a2"
SCENARIO_ID = "A2_PROCESSOR_TIMEOUT"
FIXTURE_VERSION = "1.0.0"
RECORDED_AT = "2026-07-25T00:00:00Z"
COLUMN = {name: index for index, name in enumerate(PAYMENT_EVENT_COLUMNS)}
PROCESSOR_NAME = {code: name for code, name, _, _ in PROCESSORS}
PROCESSOR_RAIL = {code: rail for code, _, rail, _ in PROCESSORS}


def field(row: tuple, name: str):
    return row[COLUMN[name]]


def p95(values: list[int]) -> int | None:
    """Nearest-rank p95, matching the demo's verification queries."""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(math.ceil(0.95 * len(ordered)), 1) - 1]


def hour_key(moment: datetime) -> datetime:
    return moment.replace(minute=0, second=0, microsecond=0)


class Dataset:
    """The rows an Analyst query would see at a given logical time."""

    def __init__(self, world: World, rows: list[tuple], logical_time: datetime) -> None:
        self.world = world
        self.rows = [row for row in rows if field(row, "event_time") <= logical_time]
        self.logical_time = logical_time

    def within(self, start: datetime, end: datetime) -> list[tuple]:
        return [row for row in self.rows if start < field(row, "event_time") <= end]

    def hourly(self, hours: int) -> list[dict]:
        window = self.within(self.logical_time - timedelta(hours=hours), self.logical_time)
        buckets: dict[datetime, list[tuple]] = defaultdict(list)
        for row in window:
            buckets[hour_key(field(row, "event_time"))].append(row)
        return [
            {"hour_start": hour, **summarise(rows)}
            for hour, rows in sorted(buckets.items())
        ]

    def by_processor(self, start: datetime, end: datetime) -> dict[str, dict]:
        groups: dict[str, list[tuple]] = defaultdict(list)
        for row in self.within(start, end):
            groups[field(row, "processor_id")].append(row)
        return {code: summarise(rows) for code, rows in groups.items()}

    def decline_mix(
        self, start: datetime, end: datetime, *, card_network: str | None = None
    ) -> list[dict]:
        groups: dict[tuple[str, str], list[tuple]] = defaultdict(list)
        for row in self.within(start, end):
            if field(row, "approved"):
                continue
            if card_network and field(row, "card_network") != card_network:
                continue
            category = self.world.merchant_category(field(row, "merchant_id"))
            groups[(category, field(row, "response_code"))].append(row)
        total = sum(len(rows) for rows in groups.values())
        mix = [
            {
                "merchant_category": category,
                "response_code": code,
                "declines": len(rows),
                "share": round(len(rows) / total, 4) if total else 0.0,
                "declined_amount_usd": round(sum(field(r, "amount_usd") for r in rows), 2),
            }
            for (category, code), rows in groups.items()
        ]
        mix.sort(key=lambda item: (-item["declines"], item["merchant_category"]))
        return mix


def summarise(rows: list[tuple]) -> dict:
    attempts = len(rows)
    if not attempts:
        return {
            "attempts": 0,
            "approvals": 0,
            "declines": 0,
            "timeout_declines": 0,
            "approval_rate": None,
            "timeout_decline_rate": None,
            "p95_latency_ms": None,
            "declined_amount_usd": 0.0,
        }
    approvals = sum(field(row, "approved") for row in rows)
    timeouts = sum(1 for row in rows if field(row, "response_code") == "TIMEOUT")
    return {
        "attempts": attempts,
        "approvals": approvals,
        "declines": attempts - approvals,
        "timeout_declines": timeouts,
        "approval_rate": round(approvals / attempts, 6),
        "timeout_decline_rate": round(timeouts / attempts, 6),
        "p95_latency_ms": p95([field(row, "latency_ms") for row in rows]),
        "declined_amount_usd": round(
            sum(field(row, "amount_usd") for row in rows if not field(row, "approved")), 2
        ),
    }


def build_datasets(world: World) -> tuple[Dataset, Dataset]:
    baseline_rows: list[tuple] = []
    for minute in range(world.baseline_minutes):
        baseline_rows.extend(world.generate_minute(1, minute))

    definition = scenarios.get_definition(SCENARIO_ID)
    start = world.baseline_minutes
    injected = list(baseline_rows)
    for minute in range(start, start + definition.window_minutes):
        injected.extend(
            world.generate_minute(
                1, minute, excluded_segment_keys=definition.excluded_segment_keys
            )
        )
    payment_batches = scenarios.build_rows(SCENARIO_ID, world, run_id=1, start_minute=start)
    injected.extend(scenarios.rows_for_table(payment_batches, "payment_event"))

    return (
        Dataset(world, baseline_rows, world.epoch),
        Dataset(
            world,
            injected,
            world.minute_start(start + definition.window_minutes),
        ),
    )


# -- answer construction ---------------------------------------------------


def table(columns: list[str], rows: list[list]) -> dict:
    return {"columns": columns, "rows": rows, "row_count": len(rows), "truncated": False}


def sql(command: str, tables: list[str]) -> dict:
    return {"command": command.strip(), "confidence_score": 0.95, "tables_used": tables}


def line_chart(points: list[dict]) -> dict:
    labels = [point["hour_start"].strftime("%Y-%m-%d %H:00") for point in points]
    return {
        "data": [
            {
                "type": "scatter",
                "mode": "lines+markers",
                "name": "Authorization rate (%)",
                "x": labels,
                "y": [round(point["approval_rate"] * 100, 2) for point in points],
            },
            {
                "type": "scatter",
                "mode": "lines",
                "name": "p95 latency (ms)",
                "x": labels,
                "y": [point["p95_latency_ms"] for point in points],
                "yaxis": "y2",
            },
        ],
        "layout": {
            "title": "Authorization rate and p95 latency by logical hour",
            "yaxis": {"title": "Authorization rate (%)"},
            "yaxis2": {"title": "p95 latency (ms)", "overlaying": "y", "side": "right"},
            "legend": {"orientation": "h"},
        },
    }


def hourly_answer(dataset: Dataset, *, injected: bool) -> list[dict]:
    points = dataset.hourly(24)
    overall = summarise(
        dataset.within(dataset.logical_time - timedelta(hours=24), dataset.logical_time)
    )
    worst = min(points, key=lambda point: point["approval_rate"])

    text = (
        f"Across the last 24 logical hours ending {dataset.logical_time:%Y-%m-%d %H:%M}, "
        f"{overall['attempts']:,} authorization attempts were approved at "
        f"{overall['approval_rate'] * 100:.2f}% with a p95 latency of "
        f"{overall['p95_latency_ms']:,} ms and {overall['declines']:,} declines, of which "
        f"{overall['timeout_declines']:,} were timeouts. "
    )
    if injected:
        text += (
            f"The weakest hour is {worst['hour_start']:%H:00} at "
            f"{worst['approval_rate'] * 100:.2f}% with a p95 of {worst['p95_latency_ms']:,} ms, "
            "which is where the timeout declines concentrate. This is measured performance; "
            "confirming the cause is a human step."
        )
    else:
        text += (
            "Performance is flat across the period: every hour sits within a fraction of a "
            "point of the 24-hour rate, and the variation in volume follows the normal daily "
            "shape rather than any change in quality."
        )

    return [
        {
            "text": text,
            "sql": sql(
                """
SELECT hour_start,
       SUM(attempts) AS attempts,
       SUM(approvals) / SUM(attempts) AS approval_rate,
       MAX(p95_latency_ms) AS p95_latency_ms,
       SUM(declines) AS declines
FROM aa_payment_performance_hourly
GROUP BY hour_start
ORDER BY hour_start
                """,
                ["aa_payment_performance_hourly"],
            ),
            "table": table(
                ["hour_start", "attempts", "approval_rate", "p95_latency_ms", "declines"],
                [
                    [
                        point["hour_start"].strftime("%Y-%m-%d %H:00:00"),
                        point["attempts"],
                        round(point["approval_rate"], 4),
                        point["p95_latency_ms"],
                        point["declines"],
                    ]
                    for point in points
                ],
            ),
            "chart": line_chart(points),
            "error": None,
        }
    ]


def processor_comparison_answer(dataset: Dataset, *, injected: bool) -> list[dict]:
    recent_end = dataset.logical_time
    recent_start = recent_end - timedelta(hours=1)
    recent = dataset.by_processor(recent_start, recent_end)
    baseline = dataset.by_processor(recent_end - timedelta(days=7), recent_start)

    rows = []
    for code in sorted(set(recent) | set(baseline)):
        current = recent.get(code, summarise([]))
        prior = baseline.get(code, summarise([]))
        delta = (
            round(current["approval_rate"] - prior["approval_rate"], 6)
            if current["approval_rate"] is not None and prior["approval_rate"] is not None
            else None
        )
        rows.append(
            [
                code,
                PROCESSOR_NAME[code],
                PROCESSOR_RAIL[code],
                current["attempts"],
                round(current["approval_rate"], 4) if current["approval_rate"] else None,
                round(prior["approval_rate"], 4) if prior["approval_rate"] else None,
                delta,
                current["p95_latency_ms"],
                prior["p95_latency_ms"],
            ]
        )

    moved = sorted(
        [row for row in rows if row[6] is not None], key=lambda row: row[6]
    )
    lead = moved[0] if moved else None

    if injected and lead:
        text = (
            f"Comparing the most recent logical hour against the preceding seven logical days, "
            f"{lead[1]} ({lead[0]}, {lead[2]}) has moved furthest: "
            f"{lead[4] * 100:.2f}% against a baseline of {lead[5] * 100:.2f}%, a change of "
            f"{lead[6] * 100:.2f} points, with p95 latency at {lead[7]:,} ms against "
            f"{lead[8]:,} ms. The other processors are within a fraction of a point of their "
            "own baselines, so the movement is specific to one processor rather than systemic."
        )
    else:
        text = (
            "Comparing the most recent logical hour against the preceding seven logical days, "
            "every processor is within a fraction of a point of its own baseline approval rate, "
            "and p95 latency is unchanged. There is no processor-level deviation in this period."
        )

    return [
        {
            "text": text,
            "sql": sql(
                """
WITH recent AS (
  SELECT processor_id, processor_name, rail,
         SUM(attempts) AS attempts,
         SUM(approvals) / SUM(attempts) AS approval_rate,
         MAX(p95_latency_ms) AS p95_latency_ms
  FROM aa_payment_performance_hourly
  WHERE hour_start >= (SELECT MAX(hour_start) FROM aa_payment_performance_hourly)
  GROUP BY processor_id, processor_name, rail
),
baseline AS (
  SELECT processor_id,
         SUM(approvals) / SUM(attempts) AS approval_rate,
         MAX(p95_latency_ms) AS p95_latency_ms
  FROM aa_payment_performance_hourly
  WHERE hour_start < (SELECT MAX(hour_start) FROM aa_payment_performance_hourly)
  GROUP BY processor_id
)
SELECT r.processor_id, r.processor_name, r.rail, r.attempts,
       r.approval_rate, b.approval_rate AS baseline_approval_rate,
       r.approval_rate - b.approval_rate AS approval_rate_change,
       r.p95_latency_ms, b.p95_latency_ms AS baseline_p95_latency_ms
FROM recent r JOIN baseline b ON b.processor_id = r.processor_id
ORDER BY approval_rate_change
                """,
                ["aa_payment_performance_hourly"],
            ),
            "table": table(
                [
                    "processor_id",
                    "processor_name",
                    "rail",
                    "attempts",
                    "approval_rate",
                    "baseline_approval_rate",
                    "approval_rate_change",
                    "p95_latency_ms",
                    "baseline_p95_latency_ms",
                ],
                rows,
            ),
            "chart": None,
            "error": None,
        }
    ]


def decline_mix_answer(
    dataset: Dataset, *, injected: bool, card_network: str | None = None
) -> list[dict]:
    end = dataset.logical_time
    start = end - timedelta(hours=1)
    mix = dataset.decline_mix(start, end, card_network=card_network)
    scope = f" for {card_network}" if card_network else ""

    if not mix:
        text = f"There are no declines{scope} in the most recent logical hour."
    else:
        top = mix[0]
        text = (
            f"In the most recent logical hour{scope}, declines are led by "
            f"{top['response_code']} on {top['merchant_category']} with {top['declines']:,} "
            f"declines, {top['share'] * 100:.1f}% of all declines in the period and "
            f"${top['declined_amount_usd']:,.0f} of declined value. "
        )
        text += (
            "TIMEOUT is the dominant code, which points at processor response time rather "
            "than issuer decisioning. Confirming that is a human step."
            if injected and top["response_code"] == "TIMEOUT"
            else "The mix is the usual issuer-side pattern led by insufficient funds and "
            "do-not-honor, with no code out of proportion."
        )

    network_filter = (
        f"\n  AND card_network = '{card_network}'" if card_network else ""
    )
    return [
        {
            "text": text,
            "sql": sql(
                f"""
SELECT merchant_category, response_code,
       SUM(decline_count) AS declines,
       SUM(declined_amount_usd) AS declined_amount_usd
FROM aa_payment_decline_mix
WHERE hour_start >= (SELECT MAX(hour_start) FROM aa_payment_decline_mix){network_filter}
GROUP BY merchant_category, response_code
ORDER BY declines DESC
                """,
                ["aa_payment_decline_mix"],
            ),
            "table": table(
                ["merchant_category", "response_code", "declines", "share", "declined_amount_usd"],
                [
                    [
                        item["merchant_category"],
                        item["response_code"],
                        item["declines"],
                        item["share"],
                        item["declined_amount_usd"],
                    ]
                    for item in mix
                ],
            ),
            "chart": None,
            "error": None,
        }
    ]


def refusal_answer() -> list[dict]:
    return [
        {
            "text": (
                "I cannot route payment traffic. I have read-only access to authorization "
                "performance data and no ability to change routing, processor configuration, "
                "or any payment decision, and routing changes stay with payment operations.\n\n"
                "What I can do is give you the evidence for that decision: the affected lane's "
                "approval rate and p95 latency against its own seven-day baseline, the share of "
                "declines carrying a TIMEOUT code, and the value of the declined attempts. Ask "
                "for any of those and I will show the measurement and the query behind it."
            ),
            "sql": None,
            "table": None,
            "chart": None,
            "error": None,
        }
    ]


def ambiguous_answer(dataset: Dataset) -> list[dict]:
    end = dataset.logical_time
    recent = dataset.by_processor(end - timedelta(hours=1), end)
    rows = [
        [
            code,
            PROCESSOR_NAME[code],
            round(metrics["approval_rate"], 4),
            metrics["p95_latency_ms"],
            round(metrics["timeout_decline_rate"], 4),
        ]
        for code, metrics in sorted(recent.items())
    ]
    return [
        {
            "text": (
                '"Badly" can mean several different things here, so I have not picked one for '
                "you. I can rank processors by approval rate, by p95 authorization latency, or "
                "by timeout share, and those rankings do not always agree.\n\n"
                "Below is the most recent logical hour on all three measures so you can see "
                "which one you mean. Tell me which measure matters and I will rank on it "
                "against the seven-day baseline."
            ),
            "sql": sql(
                """
SELECT processor_id, processor_name,
       SUM(approvals) / SUM(attempts) AS approval_rate,
       MAX(p95_latency_ms) AS p95_latency_ms,
       SUM(timeout_declines) / SUM(attempts) AS timeout_decline_rate
FROM aa_payment_performance_hourly
WHERE hour_start >= (SELECT MAX(hour_start) FROM aa_payment_performance_hourly)
GROUP BY processor_id, processor_name
ORDER BY approval_rate
                """,
                ["aa_payment_performance_hourly"],
            ),
            "table": table(
                [
                    "processor_id",
                    "processor_name",
                    "approval_rate",
                    "p95_latency_ms",
                    "timeout_decline_rate",
                ],
                rows,
            ),
            "chart": None,
            "error": None,
        }
    ]


def no_data_answer() -> list[dict]:
    return [
        {
            "text": (
                "There is no authorization data for issuer country JP in this dataset. The "
                "issuer countries present are US, GB, DE and CA, so the filter returns no rows "
                "rather than a low value, and I have not substituted a nearby country."
            ),
            "sql": sql(
                """
SELECT issuer_country,
       SUM(attempts) AS attempts,
       SUM(approvals) / SUM(attempts) AS approval_rate
FROM aa_payment_performance_hourly
WHERE issuer_country = 'JP'
GROUP BY issuer_country
                """,
                ["aa_payment_performance_hourly"],
            ),
            "table": table(["issuer_country", "attempts", "approval_rate"], []),
            "chart": None,
            "error": None,
        }
    ]


def invalid_filter_answer() -> list[dict]:
    return [
        {
            "text": (
                "'not-a-date' is not a timestamp, so I cannot filter hour_start on it and I "
                "will not guess a period. hour_start values are logical-hour timestamps such as "
                "2026-07-25 08:00:00. Give me a timestamp, or a relative period like the last 24 "
                "logical hours, and I will run the same query against it."
            ),
            "sql": None,
            "table": table(["hour_start", "approval_rate"], []),
            "chart": None,
            "error": "invalid_filter_value",
        }
    ]


def fixtures(baseline: Dataset, injected: Dataset) -> list[dict]:
    def record(
        fixture_id: str,
        prompt: str,
        match: list[str],
        state: str,
        results: list[dict],
        latency_ms: int,
    ) -> dict:
        return {
            "id": fixture_id,
            "anchor": "a2",
            "prompt": prompt,
            "match": match,
            "recorded_at": RECORDED_AT,
            "fixture_version": FIXTURE_VERSION,
            "scenario_state": state,
            "latency_ms": latency_ms,
            "results": results,
        }

    return [
        record(
            "hourly_performance_baseline",
            "Show authorization rate, p95 latency, and decline volume by hour.",
            ["authorization rate by hour", "hourly approval rate", "p95 latency by hour", "decline volume"],
            "baseline",
            hourly_answer(baseline, injected=False),
            2400,
        ),
        record(
            "hourly_performance_after",
            "Show authorization rate, p95 latency, and decline volume by hour.",
            ["authorization rate by hour", "hourly approval rate", "p95 latency by hour", "decline volume"],
            "after_injection",
            hourly_answer(injected, injected=True),
            2600,
        ),
        record(
            "processor_comparison_baseline",
            "During the weakest window, rank processors and rails against the prior seven-day baseline.",
            ["rank processors", "compare processor", "against baseline", "processor rail comparison"],
            "baseline",
            processor_comparison_answer(baseline, injected=False),
            3100,
        ),
        record(
            "processor_comparison_after",
            "During the weakest window, rank processors and rails against the prior seven-day baseline.",
            ["rank processors", "compare processor", "against baseline", "processor rail comparison"],
            "after_injection",
            processor_comparison_answer(injected, injected=True),
            3300,
        ),
        record(
            "decline_mix_baseline",
            "Break the largest change down by merchant category and response code.",
            ["merchant category", "response code", "decline breakdown", "why declines"],
            "baseline",
            decline_mix_answer(baseline, injected=False),
            2700,
        ),
        record(
            "decline_mix_after",
            "Break the largest change down by merchant category and response code.",
            ["merchant category", "response code", "decline breakdown", "why declines"],
            "after_injection",
            decline_mix_answer(injected, injected=True),
            2900,
        ),
        record(
            "decline_mix_mastercard_after",
            "Now show the same breakdown for Mastercard only.",
            ["mastercard only", "same breakdown mastercard", "filter mastercard"],
            "after_injection",
            decline_mix_answer(injected, injected=True, card_network="Mastercard"),
            2500,
        ),
        record(
            "decline_mix_mastercard_baseline",
            "Now show the same breakdown for Mastercard only.",
            ["mastercard only", "same breakdown mastercard", "filter mastercard"],
            "baseline",
            decline_mix_answer(baseline, injected=False, card_network="Mastercard"),
            2500,
        ),
        record(
            "ambiguous_processor_quality",
            "Which processor is performing badly?",
            ["performing badly", "worst processor", "which processor is bad"],
            "any",
            ambiguous_answer(injected),
            2200,
        ),
        record(
            "unsupported_routing_action",
            "Route all Mastercard GB traffic away from P2 right now.",
            [
                "route traffic",
                "reroute",
                "move traffic away",
                "block payments",
                "disable processor",
            ],
            "any",
            refusal_answer(),
            900,
        ),
        record(
            "no_data_issuer_country",
            "Show authorization rate for issuer country JP.",
            ["issuer country JP", "japan authorization", "country jp"],
            "any",
            no_data_answer(),
            1500,
        ),
        record(
            "invalid_filter_hour_start",
            "Show authorization rate for hour_start = 'not-a-date'.",
            ["not-a-date", "invalid hour_start", "bad date filter"],
            "any",
            invalid_filter_answer(),
            800,
        ),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed fixtures match the generator instead of writing them",
    )
    args = parser.parse_args()

    settings = settings_from_env()
    world = World(settings.seed, settings.epoch, settings.baseline_days)
    baseline, injected = build_datasets(world)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stale: list[str] = []
    for fixture in fixtures(baseline, injected):
        path = OUTPUT_DIR / f"{fixture['id']}.json"
        body = json.dumps(fixture, indent=2, sort_keys=True, default=str) + "\n"
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != body:
                stale.append(path.name)
            continue
        path.write_text(body, encoding="utf-8")
        print(f"wrote {path.relative_to(REPO_ROOT)}")

    if args.check:
        if stale:
            print("stale fixtures: " + ", ".join(stale))
            print("regenerate with: python scripts/build_fixtures.py")
            return 1
        print("all fixtures match the generator")
    return 0


if __name__ == "__main__":
    sys.exit(main())
