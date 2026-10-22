"""A3 Fraud Strategy baseline: closed fraud cases with human dispositions.

Every ``fraud_alert`` links to a real ``payment_event`` row so
``aa_fraud_segment_evidence`` can join through to a merchant, customer, and
amount. Rows are picked from the background traffic ``World`` already knows
how to regenerate for any logical minute, so the baseline inserts no extra
payment rows. ``A3_LOSS_CLUSTER``, ``A3_LIVE_CLEARS``, and
``A3_LIVE_CONFIRMS`` add their own payments, each tagged with its scenario id.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import timedelta

from .. import text_vectors
from ..generator import PAYMENT_EVENT_COLUMNS, World
from ..rng import det_choice, det_float, det_int, det_weighted_choice
from ..rowbatch import TableBatch
from ..tables import TABLE_COLUMNS
from .shared_dims import DEVICE_COUNT, device_id

_RAIL = PAYMENT_EVENT_COLUMNS.index("rail")
_AMOUNT_USD = PAYMENT_EVENT_COLUMNS.index("amount_usd")
_APPROVED = PAYMENT_EVENT_COLUMNS.index("approved")

CHANNEL_BY_RAIL: dict[str, str] = {
    "card_ecommerce": "card_not_present",
    "card_present": "card_present",
    "account_to_account": "online_banking",
}
FRAUD_TYPES_BY_CHANNEL: dict[str, tuple[str, ...]] = {
    "card_not_present": ("card_testing", "account_takeover", "first_party"),
    "card_present": ("first_party", "synthetic_identity"),
    "online_banking": ("account_takeover", "synthetic_identity"),
}
REASON_CODES_BY_FRAUD_TYPE: dict[str, tuple[str, ...]] = {
    "card_testing": ("velocity_breach", "cvv_retry"),
    "account_takeover": ("device_mismatch", "known_bad_device", "geo_anomaly"),
    "synthetic_identity": ("known_bad_device", "velocity_breach", "device_mismatch"),
    "first_party": ("geo_anomaly", "velocity_breach"),
}
CHANNELS: tuple[str, ...] = tuple(CHANNEL_BY_RAIL.values())
FRAUD_TYPES: tuple[str, ...] = tuple(REASON_CODES_BY_FRAUD_TYPE)
REASON_CODE_POOL: tuple[str, ...] = tuple(
    dict.fromkeys(code for codes in REASON_CODES_BY_FRAUD_TYPE.values() for code in codes)
)
DISPOSITION_WEIGHTS = (("confirmed_fraud", 20), ("legitimate", 65), ("open", 15))
ALERTS_PER_DAY = 3

# Several wordings per reason code, as different investigators would write them.
# Paraphrases share meaning rather than words, which is what the sentence
# embeddings in ``text_vectors`` are for.
REASON_NOTE_SENTENCES: dict[str, tuple[str, ...]] = {
    "velocity_breach": (
        "Rapid repeat card attempts from one device within minutes.",
        "A flurry of quick retries on the card, all from the same phone.",
        "Dozens of authorization attempts in a short burst before one went through.",
        "Unusually high number of transactions in a very short time.",
    ),
    "cvv_retry": (
        "Several security code failures before an approved charge.",
        "Wrong CVV entered multiple times, then a small charge was approved.",
        "Card verification failed repeatedly before a low-value purchase cleared.",
        "Multiple mismatched security codes preceded the successful payment.",
    ),
    "geo_anomaly": (
        "Purchase location far from the customer's usual region.",
        "Transaction originated in a country the customer has never shopped from.",
        "Charge came from an unfamiliar city, hundreds of miles from home.",
        "IP address and billing address are in different regions.",
    ),
    "device_mismatch": (
        "Login from a device not previously linked to the customer.",
        "First time this phone has been used on the account.",
        "Session came from an unrecognized browser and device fingerprint.",
        "New device added to the account shortly before the payment.",
    ),
    "known_bad_device": (
        "Device previously linked to confirmed fraud on another account.",
        "This device fingerprint appears on an earlier fraud case for a different customer.",
        "Same handset was used in a past account takeover.",
        "Device is on the internal block list from a prior investigation.",
    ),
}
OUTCOME_NOTE_SENTENCES: dict[str, tuple[str, ...]] = {
    "confirmed_fraud": (
        "Customer denied the transactions; loss confirmed.",
        "Cardholder did not recognize the charges; card reissued and loss written off.",
        "Called the customer, who disputed every charge; confirmed as fraud.",
    ),
    "legitimate": (
        "Customer confirmed the purchase; closed as legitimate.",
        "Cardholder verified the transaction; no fraud.",
        "Reached the customer, who recognized the charge; alert cleared.",
    ),
    "open": (
        "Awaiting customer contact.",
        "Left a voicemail; case still open.",
        "Sent a verification text; waiting on a reply.",
    ),
}


@dataclass(frozen=True)
class CaseNote:
    """An investigator note: what was observed, then how the case ended.

    Only ``observed`` is embedded. The outcome is the label a reviewer is
    trying to predict, so letting it into the vector would make similar-case
    search look smarter than it is.
    """

    observed: tuple[str, ...]
    outcome: str

    @property
    def text(self) -> str:
        return " ".join((*self.observed, self.outcome))

    @property
    def embedding_sql(self) -> str:
        return text_vectors.to_sql(text_vectors.embed_sentences(self.observed))


def case_note(reason_codes: list[str], disposition: str, seed: int, *key: object) -> CaseNote:
    observed = tuple(
        det_choice(REASON_NOTE_SENTENCES[code], seed, *key, "note", code)
        for code in dict.fromkeys(reason_codes)
    )
    outcome = det_choice(OUTCOME_NOTE_SENTENCES[disposition], seed, *key, "note", disposition)
    return CaseNote(observed, outcome)


def _alert_id(index: int) -> str:
    return f"FALT-A3B-{index:06d}"


def _case_id(index: int) -> str:
    return f"FCASE-A3B-{index:06d}"


def _evidence_id(index: int) -> str:
    return f"FEVD-A3B-{index:06d}"


def seed_baseline(world: World, run_id: int) -> list[TableBatch]:
    alert_rows: list[tuple] = []
    case_rows: list[tuple] = []
    evidence_rows: list[tuple] = []

    counter = 0
    baseline_minutes = world.baseline_minutes
    for day in range(max(world.baseline_days, 1)):
        for _ in range(ALERTS_PER_DAY):
            counter += 1
            minute_index = det_int(
                world.seed,
                "a3b-minute",
                counter,
                low=day * 1440,
                high=min((day + 1) * 1440 - 1, max(baseline_minutes - 1, 0)),
            )
            # Only approved payments can turn into a loss, so only they get flagged.
            candidates = [
                row for row in world.generate_minute(run_id, minute_index) if row[_APPROVED]
            ]
            if not candidates:
                continue
            payment = candidates[
                det_int(world.seed, "a3b-payment", counter, low=0, high=len(candidates) - 1)
            ]
            payment_id = payment[1]
            event_time = payment[3]
            created_at = event_time + timedelta(seconds=det_int(world.seed, "a3b-delay", counter, low=30, high=900))

            alert_id = _alert_id(counter)
            device = device_id(det_int(world.seed, "a3b-device", counter, low=1, high=DEVICE_COUNT))
            channel = CHANNEL_BY_RAIL[payment[_RAIL]]
            fraud_type = det_choice(FRAUD_TYPES_BY_CHANNEL[channel], world.seed, "a3b-fraud-type", counter)
            code_pool = REASON_CODES_BY_FRAUD_TYPE[fraud_type]
            reason_codes = list(
                dict.fromkeys(
                    det_choice(code_pool, world.seed, "a3b-reason", counter, slot)
                    for slot in range(det_int(world.seed, "a3b-reason-count", counter, low=1, high=2))
                )
            )
            score = round(det_float(world.seed, "a3b-score", counter, low=0.35, high=0.99), 4)
            disposition = det_weighted_choice(DISPOSITION_WEIGHTS, world.seed, "a3b-disposition", counter)
            status = "closed" if disposition != "open" else "open"

            alert_rows.append(
                (
                    run_id,
                    alert_id,
                    payment_id,
                    device,
                    channel,
                    created_at,
                    score,
                    fraud_type,
                    json.dumps(reason_codes),
                    status,
                    None,
                )
            )

            opened_at = created_at + timedelta(seconds=det_int(world.seed, "a3b-open-delay", counter, low=60, high=1800))
            confirmed_loss = 0.0
            closed_at = None
            if disposition != "open":
                closed_at = opened_at + timedelta(
                    hours=det_int(world.seed, "a3b-close-hours", counter, low=2, high=72)
                )
                if disposition == "confirmed_fraud":
                    confirmed_loss = payment[_AMOUNT_USD]
            note = case_note(reason_codes, disposition, world.seed, "a3b", counter)
            case_rows.append(
                (
                    run_id,
                    _case_id(counter),
                    alert_id,
                    opened_at,
                    closed_at,
                    f"INV-{det_int(world.seed, 'a3b-investigator', counter, low=1, high=12):03d}",
                    disposition,
                    confirmed_loss,
                    note.text,
                    note.embedding_sql,
                    None,
                )
            )
            evidence_rows.append(
                (
                    run_id,
                    _evidence_id(counter),
                    _case_id(counter),
                    "device_history",
                    device,
                    f"{det_int(world.seed, 'a3b-evidence-value', counter, low=1, high=9)} prior sightings",
                    opened_at,
                    None,
                )
            )

    return [
        TableBatch("fraud_alert", TABLE_COLUMNS["fraud_alert"], alert_rows),
        TableBatch("fraud_case", TABLE_COLUMNS["fraud_case"], case_rows),
        TableBatch("fraud_evidence", TABLE_COLUMNS["fraud_evidence"], evidence_rows),
    ]
