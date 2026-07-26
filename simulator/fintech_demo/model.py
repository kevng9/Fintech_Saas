"""Static shape of the synthetic fintech world.

Everything here is synthetic. No real customer, merchant, processor, card, or
account identifier appears in this file or in anything generated from it.
"""

from __future__ import annotations

from dataclasses import dataclass

from .rng import det_choice, det_int

CURRENCY_BY_COUNTRY = {"US": "USD", "GB": "GBP", "DE": "EUR", "CA": "CAD"}

# Fixed synthetic conversion rates so value totals can be summed across issuer
# countries. These are constants of the demo fixture, not market data.
USD_RATE_BY_CURRENCY = {"USD": 1.00, "GBP": 1.27, "EUR": 1.09, "CAD": 0.74}


def to_usd(amount: float, currency: str) -> float:
    return round(amount * USD_RATE_BY_CURRENCY.get(currency, 1.0), 2)

GEOGRAPHIES = [
    # geography_id, country, country_name, region, risk_band
    ("GEO-US", "US", "United States", "North America", "low"),
    ("GEO-GB", "GB", "United Kingdom", "United Kingdom", "low"),
    ("GEO-DE", "DE", "Germany", "Europe", "low"),
    ("GEO-CA", "CA", "Canada", "North America", "low"),
]

PROCESSORS = [
    # processor_id, processor_name, rail, contracted_sla_ms
    ("P1", "Northwind Pay", "card_ecommerce", 250),
    ("P2", "Cardinal Rails", "card_ecommerce", 300),
    ("P3", "Vantage Gateway", "card_present", 220),
    ("P4", "Meridian Direct", "account_to_account", 400),
]

MERCHANT_CATEGORIES = [
    "Digital Goods",
    "Travel",
    "Grocery",
    "Streaming",
    "Electronics",
    "Ride Hailing",
    "Apparel",
    "Gaming",
]

MERCHANT_NAME_PARTS = [
    "Harbor",
    "Northgate",
    "Bluewater",
    "Silverline",
    "Redstone",
    "Kingsway",
    "Alder",
    "Copperfield",
    "Marlow",
    "Brightside",
]

MERCHANT_NAME_SUFFIX = ["Retail", "Group", "Direct", "Online", "Markets"]

CUSTOMER_FIRST_NAMES = [
    "Ava", "Noah", "Mia", "Liam", "Zara", "Owen", "Iris", "Elias",
    "Nina", "Rowan", "Talia", "Jonas", "Freya", "Marcus", "Lena", "Idris",
]

CUSTOMER_LAST_NAMES = [
    "Whitfield", "Okafor", "Lindqvist", "Barros", "Nakamura", "Delacroix",
    "Halloran", "Petrov", "Adeyemi", "Vasquez", "Ferreira", "Novak",
]

CUSTOMER_SEGMENTS = ["Consumer", "Small Business", "Commercial"]
RISK_TIERS = ["low", "medium", "high"]

DECLINE_CODE_WEIGHTS = [
    ("INSUFFICIENT_FUNDS", 40),
    ("DO_NOT_HONOR", 25),
    ("EXPIRED_CARD", 12),
    ("INVALID_CVV", 10),
    ("RISK_DECLINE", 8),
    ("ISSUER_UNAVAILABLE", 5),
]

TIMEOUT_CODE = "TIMEOUT"
APPROVED_CODE = "APPROVED"

AMOUNT_RANGE_BY_CATEGORY = {
    "Digital Goods": (4, 90),
    "Travel": (120, 1400),
    "Grocery": (10, 220),
    "Streaming": (6, 30),
    "Electronics": (40, 900),
    "Ride Hailing": (8, 70),
    "Apparel": (20, 320),
    "Gaming": (5, 120),
}

# Volume multiplier per UTC hour of day. Attempts for a segment-hour are
# base_hundreds * shape * 100, so every documented percentage stays integral.
HOUR_SHAPE = (
    1, 1, 1, 1, 1, 1,
    2, 2, 2,
    3, 3, 3,
    2, 2,
    3, 3, 3, 3,
    2, 2, 2,
    1, 1, 1,
)

MERCHANT_COUNT = 40
CUSTOMER_COUNT = 500


@dataclass(frozen=True)
class Segment:
    """One authorization traffic lane: processor x network x issuer country."""

    processor_id: str
    card_network: str
    issuer_country: str
    base_hundreds: int
    approval_rate: float
    tail_latency_ms: int

    @property
    def key(self) -> str:
        return f"{self.processor_id}|{self.card_network}|{self.issuer_country}"

    def attempts_for_hour(self, hour_of_day: int) -> int:
        return self.base_hundreds * HOUR_SHAPE[hour_of_day] * 100


SEGMENTS: tuple[Segment, ...] = (
    Segment("P1", "Visa", "US", 2, 0.97, 150),
    Segment("P1", "Mastercard", "US", 1, 0.97, 150),
    Segment("P2", "Mastercard", "GB", 2, 0.96, 180),
    Segment("P2", "Visa", "GB", 1, 0.96, 180),
    Segment("P2", "Mastercard", "US", 1, 0.96, 180),
    Segment("P3", "Visa", "US", 1, 0.95, 200),
    Segment("P3", "Amex", "US", 1, 0.95, 200),
    Segment("P4", "Visa", "DE", 1, 0.94, 260),
)

# The A2 story segment. A2_PROCESSOR_TIMEOUT degrades exactly this lane.
AFFECTED_SEGMENT_KEY = "P2|Mastercard|GB"
AFFECTED_SEGMENT = next(s for s in SEGMENTS if s.key == AFFECTED_SEGMENT_KEY)

RAIL_BY_PROCESSOR = {processor_id: rail for processor_id, _, rail, _ in PROCESSORS}
REGION_BY_COUNTRY = {country: region for _, country, _, region, _ in GEOGRAPHIES}


def merchant_id(index: int) -> str:
    return f"MERCH-{index:03d}"


def customer_id(index: int) -> str:
    return f"CUST-{index:04d}"


def account_id(index: int) -> str:
    return f"ACCT-{index:04d}"


def build_merchants(seed: int) -> list[dict]:
    merchants: list[dict] = []
    for index in range(1, MERCHANT_COUNT + 1):
        category = MERCHANT_CATEGORIES[(index - 1) % len(MERCHANT_CATEGORIES)]
        region = GEOGRAPHIES[(index - 1) % len(GEOGRAPHIES)][3]
        name = "{} {} {}".format(
            det_choice(MERCHANT_NAME_PARTS, seed, "merchant-name", index),
            category.split(" ")[0],
            det_choice(MERCHANT_NAME_SUFFIX, seed, "merchant-suffix", index),
        )
        merchants.append(
            {
                "merchant_id": merchant_id(index),
                "merchant_name": name,
                "merchant_category": category,
                "region": region,
            }
        )
    return merchants


def build_customers(seed: int, epoch_year: int) -> list[dict]:
    customers: list[dict] = []
    for index in range(1, CUSTOMER_COUNT + 1):
        first = det_choice(CUSTOMER_FIRST_NAMES, seed, "cust-first", index)
        last = det_choice(CUSTOMER_LAST_NAMES, seed, "cust-last", index)
        country = GEOGRAPHIES[(index - 1) % len(GEOGRAPHIES)][1]
        customers.append(
            {
                "customer_id": customer_id(index),
                "synthetic_name": f"{first} {last}",
                "segment": det_choice(CUSTOMER_SEGMENTS, seed, "cust-segment", index),
                "region": REGION_BY_COUNTRY[country],
                "relationship_start": "{:04d}-{:02d}-{:02d}".format(
                    epoch_year - det_int(seed, "cust-tenure", index, low=0, high=8),
                    det_int(seed, "cust-month", index, low=1, high=12),
                    det_int(seed, "cust-day", index, low=1, high=28),
                ),
                "risk_tier": det_choice(RISK_TIERS, seed, "cust-risk", index),
                "consent_scope": "demo_synthetic",
                "country": country,
            }
        )
    return customers


def build_accounts(customers: list[dict]) -> list[dict]:
    accounts: list[dict] = []
    for index, customer in enumerate(customers, start=1):
        accounts.append(
            {
                "account_id": account_id(index),
                "customer_id": customer["customer_id"],
                "account_type": "checking" if index % 3 else "card",
                "currency": CURRENCY_BY_COUNTRY[customer["country"]],
                "opened_at": customer["relationship_start"],
                "status": "active",
            }
        )
    return accounts


def merchants_for_country(merchants: list[dict], country: str) -> list[dict]:
    region = REGION_BY_COUNTRY[country]
    matching = [m for m in merchants if m["region"] == region]
    return matching or merchants


def merchants_for_country_category(
    merchants: list[dict], country: str, category: str
) -> list[dict]:
    region = REGION_BY_COUNTRY[country]
    matching = [
        m for m in merchants if m["region"] == region and m["merchant_category"] == category
    ]
    if matching:
        return matching
    return [m for m in merchants if m["merchant_category"] == category] or merchants


def customers_for_country(customers: list[dict], country: str) -> list[dict]:
    matching = [c for c in customers if c["country"] == country]
    return matching or customers
