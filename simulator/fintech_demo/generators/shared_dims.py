"""Shared dimensions for anchors A1 and A3-A8.

``dim_product``, ``dim_device``, ``dim_entity``, and ``dim_counterparty``
(``database/migrations/005_shared_dimensions.sql``) do not depend on any
scenario. They are built once from the run seed, the same way
``model.build_merchants`` and ``model.build_customers`` build the A2
dimensions, so every run (and the template) gets identical rows and a reset
can verify them by fingerprint.

Each ``build_*`` function returns rows in the same column order as
``tables.TABLE_COLUMNS[<table>][1:]`` (everything but ``run_id``, which the
caller supplies per run). This is a stub: it seeds enough rows for later
anchor generators to join against, not the richer per-anchor shapes those
generators will eventually add.
"""

from __future__ import annotations

from ..generator import World
from ..model import GEOGRAPHIES, REGION_BY_COUNTRY
from ..rng import det_choice
from ..tables import TABLE_COLUMNS

PRODUCT_FAMILIES = ("Checking", "Savings", "Credit Card", "Personal Loan", "Business Line")
PRODUCT_CHANNELS = ("digital", "branch", "partner")
PRODUCT_COUNT = 12

DEVICE_TYPES = ("mobile_ios", "mobile_android", "desktop_web", "tablet_web")
OS_FAMILIES = ("iOS", "Android", "Windows", "macOS")
RISK_BANDS = ("low", "medium", "high")
DEVICE_COUNT = 40

ENTITY_TYPES = ("operating", "holding", "subsidiary")
ENTITY_COUNT = 6

COUNTERPARTY_TYPES = ("correspondent_bank", "clearing_partner", "card_network", "payment_processor")
COUNTERPARTY_COUNT = 10

_COUNTRIES = tuple(geography[1] for geography in GEOGRAPHIES)
_CURRENCY_BY_COUNTRY = {"US": "USD", "GB": "GBP", "DE": "EUR", "CA": "CAD"}


def product_id(index: int) -> str:
    return f"PROD-{index:03d}"


def device_id(index: int) -> str:
    return f"DEV-{index:04d}"


def entity_id(index: int) -> str:
    return f"ENT-{index:02d}"


def counterparty_id(index: int) -> str:
    return f"CPTY-{index:03d}"


def build_products(world: World) -> list[tuple]:
    """(product_id, product_name, product_family, channel)"""
    rows = []
    for index in range(1, PRODUCT_COUNT + 1):
        family = PRODUCT_FAMILIES[(index - 1) % len(PRODUCT_FAMILIES)]
        channel = det_choice(PRODUCT_CHANNELS, world.seed, "product-channel", index)
        rows.append((product_id(index), f"{family} {index:02d}", family, channel))
    return rows


def build_devices(world: World) -> list[tuple]:
    """(device_id, device_type, os_family, risk_band)"""
    rows = []
    for index in range(1, DEVICE_COUNT + 1):
        device_type = det_choice(DEVICE_TYPES, world.seed, "device-type", index)
        os_family = det_choice(OS_FAMILIES, world.seed, "device-os", index)
        risk_band = det_choice(RISK_BANDS, world.seed, "device-risk", index)
        rows.append((device_id(index), device_type, os_family, risk_band))
    return rows


def build_entities(world: World) -> list[tuple]:
    """(entity_id, entity_name, entity_type, region, currency)"""
    rows = []
    for index in range(1, ENTITY_COUNT + 1):
        entity_type = ENTITY_TYPES[(index - 1) % len(ENTITY_TYPES)]
        country = _COUNTRIES[(index - 1) % len(_COUNTRIES)]
        region = REGION_BY_COUNTRY[country]
        currency = _CURRENCY_BY_COUNTRY[country]
        rows.append((entity_id(index), f"Synthetic Entity {index:02d}", entity_type, region, currency))
    return rows


def build_counterparties(world: World) -> list[tuple]:
    """(counterparty_id, counterparty_name, country, risk_band)"""
    rows = []
    for index in range(1, COUNTERPARTY_COUNT + 1):
        country = _COUNTRIES[(index - 1) % len(_COUNTRIES)]
        relationship_type = det_choice(COUNTERPARTY_TYPES, world.seed, "counterparty-type", index)
        risk_band = det_choice(RISK_BANDS, world.seed, "counterparty-risk", index)
        name = f"{relationship_type.replace('_', ' ').title()} {index:03d}"
        rows.append((counterparty_id(index), name, country, risk_band))
    return rows


_BUILDERS = (
    ("dim_product", build_products),
    ("dim_device", build_devices),
    ("dim_entity", build_entities),
    ("dim_counterparty", build_counterparties),
)


def build_all(world: World) -> list[tuple[str, tuple[str, ...], list[tuple]]]:
    """Every shared-dimension table as ``(table, columns_without_run_id, rows)``."""
    return [
        (table, TABLE_COLUMNS[table][1:], builder(world))
        for table, builder in _BUILDERS
    ]
