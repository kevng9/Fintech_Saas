from __future__ import annotations

import json
import math
from datetime import datetime

from fintech_demo import scenarios, text_vectors
from fintech_demo.generator import World
from fintech_demo.generators import a3_fraud
from fintech_demo.tables import TABLE_COLUMNS


def _embed(sentence: str) -> list[float]:
    return text_vectors.embed_sentences([sentence])


def _all_cases() -> list[tuple]:
    world = World(20260725, datetime(2026, 7, 25, 9, 0, 0), baseline_days=7)
    batches = a3_fraud.seed_baseline(world, 1) + scenarios.build_rows(
        "A3_LOSS_CLUSTER", world, run_id=1, start_minute=world.baseline_minutes
    )
    return [row for batch in batches if batch.table == "fraud_case" for row in batch.rows]


def test_every_note_sentence_has_a_unit_vector() -> None:
    tables = (a3_fraud.REASON_NOTE_SENTENCES, a3_fraud.OUTCOME_NOTE_SENTENCES)
    for table in tables:
        for variants in table.values():
            for sentence in variants:
                vector = text_vectors.sentence_vector(sentence)
                assert len(vector) == text_vectors.dimensions()
                assert math.isclose(sum(value * value for value in vector), 1.0, rel_tol=1e-4)


def test_paraphrases_score_higher_than_other_reason_codes() -> None:
    """The point of a real embedding model: same meaning, different words."""
    for code, variants in a3_fraud.REASON_NOTE_SENTENCES.items():
        others = [
            sentence
            for other_code, other_variants in a3_fraud.REASON_NOTE_SENTENCES.items()
            if other_code != code
            for sentence in other_variants
        ]
        for sentence in variants:
            same = [text_vectors.cosine(_embed(sentence), _embed(p)) for p in variants if p != sentence]
            different = [text_vectors.cosine(_embed(sentence), _embed(o)) for o in others]
            assert sum(same) / len(same) > sum(different) / len(different), sentence


def test_vectors_embed_observations_never_outcomes() -> None:
    columns = list(TABLE_COLUMNS["fraud_case"])
    notes_index = columns.index("notes")
    vector_index = columns.index("notes_embedding")
    outcomes = {s for variants in a3_fraud.OUTCOME_NOTE_SENTENCES.values() for s in variants}
    cases = _all_cases()
    assert cases
    for row in cases:
        note = row[notes_index]
        outcome = next(s for s in outcomes if note.endswith(s))
        observed_text = note[: -len(outcome)].strip()
        observed = [
            s
            for variants in a3_fraud.REASON_NOTE_SENTENCES.values()
            for s in variants
            if s in observed_text
        ]
        assert observed
        stored = json.loads(row[vector_index])
        assert len(stored) == text_vectors.dimensions()
        expected = text_vectors.embed_sentences(sorted(observed, key=observed_text.index))
        assert max(abs(a - b) for a, b in zip(stored, expected)) < 1e-5
