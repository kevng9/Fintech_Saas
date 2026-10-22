"""Sentence-embedding vectors for fraud case notes.

Every sentence a case note can contain was embedded once with the
``sentence-transformers/all-MiniLM-L6-v2`` model by
``scripts/build_note_embeddings.py``; the results are committed in
``data/note_sentence_embeddings.json``. Seeding therefore needs no model,
network, or API key, and stays deterministic.

A note's vector is the mean of its sentence vectors, scaled to unit length so
``DOT_PRODUCT`` in SingleStore equals cosine similarity. Because the vectors
come from a real embedding model, paraphrases ("a flurry of quick retries" and
"dozens of attempts in a short burst") land close together even when they
share no words.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Iterable

EMBEDDINGS_PATH = Path(__file__).parent / "data" / "note_sentence_embeddings.json"


@lru_cache(maxsize=1)
def _store() -> dict:
    return json.loads(EMBEDDINGS_PATH.read_text(encoding="utf-8"))


def model_name() -> str:
    return _store()["model"]


def dimensions() -> int:
    return int(_store()["dimensions"])


def sentence_vector(sentence: str) -> list[float]:
    try:
        return _store()["sentences"][sentence]
    except KeyError:
        raise KeyError(
            f"No precomputed embedding for {sentence!r}. "
            "Run scripts/build_note_embeddings.py after changing note sentences."
        ) from None


def embed_sentences(sentences: Iterable[str]) -> list[float]:
    vectors = [sentence_vector(sentence) for sentence in sentences]
    if not vectors:
        return [0.0] * dimensions()
    mean = [sum(column) / len(vectors) for column in zip(*vectors)]
    norm = math.sqrt(sum(value * value for value in mean))
    return [value / norm for value in mean] if norm else mean


def to_sql(vector: list[float]) -> str:
    """JSON array literal that SingleStore casts into a ``VECTOR`` column."""
    return json.dumps([round(value, 6) for value in vector], separators=(",", ":"))


def cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))
