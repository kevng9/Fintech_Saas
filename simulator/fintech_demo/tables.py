"""Registry of run-scoped tables across every anchor.

``seed.py``, ``injection.py``, and ``fingerprint.py`` all need to agree on
what tables belong to a run, what their columns are, and what a stable
fingerprint of one row looks like. Centralising that here means a new
anchor's tables are declared once instead of copied by hand into three
places that can drift apart.

Column shapes are read directly from ``database/migrations/005`` through
``012`` (the shared dimensions and the A1/A3-A8 fact tables), not from the
prose spec, since a few columns (``scenario_id`` on most fact tables,
``channel``/``device_id`` on ``fraud_alert``, the ``*_usd`` columns on A6,
and similar) only exist in the migrations. Every caller in this package must
still treat a table absent from ``db.existing_tables`` as "not part of this
environment yet", never as an error, so the simulator keeps working against
a database that only has the A2 migrations applied.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .generator import PAYMENT_EVENT_COLUMNS


@dataclass(frozen=True)
class TableSpec:
    """One run-scoped table: its columns, natural id, and amount columns.

    ``id_column`` and ``amount_columns`` drive the generic fingerprint and
    clone helpers; a table with a composite key and no single natural id
    (for example ``cash_position_snapshot``) leaves ``id_column`` unset and
    is fingerprinted by row count alone.
    """

    name: str
    columns: tuple[str, ...]
    id_column: str | None = None
    amount_columns: tuple[str, ...] = field(default=())

    def __post_init__(self) -> None:
        if self.columns and self.columns[0] != "run_id":
            raise ValueError(f"{self.name}: run_id must be the first column for generic cloning")


# -- A2 Payment Pulse: already has migrations, generator, and injection -----
# (002_dimensions.sql, 003_a2_facts.sql)

PAYMENT_TABLES: tuple[TableSpec, ...] = (
    TableSpec(
        "dim_processor",
        ("run_id", "processor_id", "processor_name", "rail", "contracted_sla_ms"),
        id_column="processor_id",
    ),
    TableSpec(
        "dim_merchant",
        ("run_id", "merchant_id", "merchant_name", "merchant_category", "region"),
        id_column="merchant_id",
    ),
    TableSpec(
        "dim_customer",
        (
            "run_id",
            "customer_id",
            "synthetic_name",
            "segment",
            "region",
            "relationship_start",
            "risk_tier",
            "consent_scope",
        ),
        id_column="customer_id",
    ),
    TableSpec(
        "dim_account",
        ("run_id", "account_id", "customer_id", "account_type", "currency", "opened_at", "status"),
        id_column="account_id",
    ),
    TableSpec(
        "payment_event",
        PAYMENT_EVENT_COLUMNS,
        id_column="payment_id",
        amount_columns=("amount", "amount_usd"),
    ),
)

# -- Shared dimensions every anchor beyond A2 draws from ---------------------
# (005_shared_dimensions.sql)

SHARED_DIM_TABLES: tuple[TableSpec, ...] = (
    TableSpec(
        "dim_product",
        ("run_id", "product_id", "product_name", "product_family", "channel"),
        id_column="product_id",
    ),
    TableSpec(
        "dim_device",
        ("run_id", "device_id", "device_type", "os_family", "risk_band"),
        id_column="device_id",
    ),
    TableSpec(
        "dim_entity",
        ("run_id", "entity_id", "entity_name", "entity_type", "region", "currency"),
        id_column="entity_id",
    ),
    TableSpec(
        "dim_counterparty",
        ("run_id", "counterparty_id", "counterparty_name", "country", "risk_band"),
        id_column="counterparty_id",
    ),
)

# -- A1 account opening and A3-A8 anchor facts -------------------------------
# (006_a1_digital.sql, 007_a3_fraud.sql, 008_a4_aml.sql, 009_a5_disputes.sql,
#  010_a6_liquidity.sql, 011_a7_credit.sql, 012_a8_customer_money.sql)

ANCHOR_FACT_TABLES: tuple[TableSpec, ...] = (
    # A1: Account Opening Funnel
    TableSpec(
        "digital_session",
        (
            "run_id",
            "session_id",
            "customer_id",
            "channel",
            "device_id",
            "campaign",
            "intent_cohort",
            "started_at",
            "scenario_id",
        ),
        id_column="session_id",
    ),
    TableSpec(
        "digital_event",
        ("run_id", "event_id", "session_id", "event_time", "stage", "event_type", "sequence_no", "scenario_id"),
        id_column="event_id",
    ),
    TableSpec(
        "application",
        (
            "run_id",
            "application_id",
            "session_id",
            "product_id",
            "submitted_at",
            "current_stage",
            "outcome_status",
            "decision_at",
            "scenario_id",
        ),
        id_column="application_id",
    ),
    TableSpec(
        "manual_review",
        (
            "run_id",
            "review_id",
            "application_id",
            "referred_at",
            "reason_code",
            "status",
            "resolved_at",
            "scenario_id",
        ),
        id_column="review_id",
    ),
    # A3: Fraud Loss Prevention
    TableSpec(
        "fraud_alert",
        (
            "run_id",
            "alert_id",
            "payment_id",
            "device_id",
            "channel",
            "created_at",
            "score",
            "fraud_type",
            "reason_codes",
            "status",
            "scenario_id",
        ),
        id_column="alert_id",
    ),
    TableSpec(
        "fraud_case",
        (
            "run_id",
            "case_id",
            "alert_id",
            "opened_at",
            "closed_at",
            "investigator_id",
            "human_disposition",
            "confirmed_loss",
            "notes",
            "scenario_id",
        ),
        id_column="case_id",
        amount_columns=("confirmed_loss",),
    ),
    TableSpec(
        "fraud_evidence",
        (
            "run_id",
            "evidence_id",
            "case_id",
            "evidence_type",
            "source_id",
            "observed_value",
            "observed_at",
            "scenario_id",
        ),
        id_column="evidence_id",
    ),
    # A4: AML Alert Triage
    TableSpec(
        "aml_alert",
        (
            "run_id",
            "alert_id",
            "customer_id",
            "account_id",
            "rule_id",
            "priority",
            "risk_band",
            "created_at",
            "sla_due_at",
            "status",
            "assigned_queue",
            "scenario_id",
        ),
        id_column="alert_id",
    ),
    TableSpec(
        "aml_alert_transaction",
        ("run_id", "alert_id", "payment_id", "scenario_id"),
        id_column=None,  # (run_id, alert_id) is not unique: one alert links several payments
    ),
    TableSpec(
        "aml_evidence",
        (
            "run_id",
            "evidence_id",
            "alert_id",
            "source_type",
            "source_id",
            "observed_at",
            "fact_text",
            "completeness_status",
            "scenario_id",
        ),
        id_column="evidence_id",
    ),
    TableSpec(
        "aml_case_history",
        ("run_id", "prior_case_id", "customer_id", "opened_at", "human_disposition"),
        id_column="prior_case_id",
    ),
    # A5: Dispute Resolution Lens
    TableSpec(
        "dispute_case",
        (
            "run_id",
            "dispute_id",
            "payment_id",
            "customer_id",
            "opened_at",
            "due_at",
            "status",
            "reason_code",
            "priority",
            "queue_id",
            "owner_id",
            "disputed_amount",
            "scenario_id",
        ),
        id_column="dispute_id",
        amount_columns=("disputed_amount",),
    ),
    TableSpec(
        "dispute_event",
        ("run_id", "event_id", "dispute_id", "event_type", "event_time", "actor_type", "metadata", "scenario_id"),
        id_column="event_id",
    ),
    TableSpec(
        "customer_contact",
        ("run_id", "contact_id", "dispute_id", "channel", "direction", "occurred_at"),
        id_column="contact_id",
    ),
    TableSpec(
        "provisional_credit",
        ("run_id", "credit_id", "dispute_id", "amount", "status", "event_time"),
        id_column="credit_id",
        amount_columns=("amount",),
    ),
    # A6: Liquidity Command Center
    TableSpec(
        "cash_position_snapshot",
        (
            "run_id",
            "snapshot_time",
            "entity_id",
            "account_id",
            "currency",
            "ledger_balance",
            "available_balance",
            "ledger_balance_usd",
            "available_balance_usd",
        ),
        id_column=None,  # composite key: (entity_id, account_id, snapshot_time)
        amount_columns=("ledger_balance_usd", "available_balance_usd"),
    ),
    TableSpec(
        "settlement",
        (
            "run_id",
            "settlement_id",
            "entity_id",
            "counterparty_id",
            "currency",
            "amount",
            "amount_usd",
            "direction",
            "created_at",
            "due_at",
            "status",
            "scenario_id",
        ),
        id_column="settlement_id",
        amount_columns=("amount_usd",),
    ),
    TableSpec(
        "queued_payment",
        (
            "run_id",
            "queued_payment_id",
            "entity_id",
            "currency",
            "amount",
            "amount_usd",
            "created_at",
            "due_at",
            "status",
        ),
        id_column="queued_payment_id",
        amount_columns=("amount_usd",),
    ),
    TableSpec(
        "cash_flow_forecast",
        (
            "run_id",
            "forecast_time",
            "bucket_time",
            "entity_id",
            "currency",
            "expected_inflow",
            "expected_outflow",
            "expected_inflow_usd",
            "expected_outflow_usd",
            "model_version",
        ),
        id_column=None,  # composite key: (entity_id, bucket_time)
        amount_columns=("expected_inflow_usd", "expected_outflow_usd"),
    ),
    # A7: Credit Risk Pulse
    TableSpec(
        "credit_application",
        (
            "run_id",
            "application_id",
            "customer_id",
            "product_id",
            "channel",
            "submitted_at",
            "requested_amount",
            "industry_code",
            "geography_id",
            "review_status",
            "was_manual_review",
            "decision_time",
            "scenario_id",
        ),
        id_column="application_id",
        amount_columns=("requested_amount",),
    ),
    TableSpec(
        "credit_evidence",
        (
            "run_id",
            "evidence_id",
            "application_id",
            "source_type",
            "metric_name",
            "metric_value",
            "observed_at",
            "verification_status",
            "provenance_ref",
            "scenario_id",
        ),
        id_column="evidence_id",
    ),
    TableSpec(
        "portfolio_exposure_snapshot",
        (
            "run_id",
            "as_of_time",
            "facility_id",
            "entity_id",
            "industry_code",
            "geography_id",
            "existing_risk_grade",
            "outstanding_amount",
            "committed_amount",
        ),
        id_column="facility_id",
        amount_columns=("outstanding_amount", "committed_amount"),
    ),
    # A8: Explain My Money
    TableSpec(
        "customer_transaction",
        (
            "run_id",
            "transaction_id",
            "customer_id",
            "account_id",
            "event_time",
            "merchant_id",
            "category",
            "amount",
            "amount_usd",
            "currency",
            "direction",
            "scenario_id",
        ),
        id_column="transaction_id",
        amount_columns=("amount_usd",),
    ),
    TableSpec(
        "customer_financial_daily",
        ("run_id", "customer_id", "date", "inflows", "outflows", "net_flow", "ending_balance"),
        id_column=None,  # composite key: (customer_id, date)
        amount_columns=("net_flow", "ending_balance"),
    ),
)

ALL_TABLES: tuple[TableSpec, ...] = PAYMENT_TABLES + SHARED_DIM_TABLES + ANCHOR_FACT_TABLES

TABLE_SPECS: dict[str, TableSpec] = {spec.name: spec for spec in ALL_TABLES}
TABLE_COLUMNS: dict[str, tuple[str, ...]] = {spec.name: spec.columns for spec in ALL_TABLES}

# payment_event first (existing clone order), then shared dimensions, then
# every anchor fact table in the order its anchor appears in the spec.
CLONE_ORDER: tuple[str, ...] = tuple(spec.name for spec in ALL_TABLES)

DIMENSION_TABLE_NAMES: tuple[str, ...] = tuple(
    spec.name for spec in PAYMENT_TABLES if spec.name != "payment_event"
) + tuple(spec.name for spec in SHARED_DIM_TABLES)

FACT_TABLE_NAMES: tuple[str, ...] = ("payment_event",) + tuple(spec.name for spec in ANCHOR_FACT_TABLES)


def spec_for(table: str) -> TableSpec:
    return TABLE_SPECS[table]
