"""Embed every fraud case note sentence and write the committed vector file.

Run this only after changing ``REASON_NOTE_SENTENCES`` or
``OUTCOME_NOTE_SENTENCES`` in ``simulator/fintech_demo/generators/a3_fraud.py``.
It needs the ``fastembed`` package and a one-time model download (about 90 MB),
so it runs in a throwaway environment rather than the demo's ``.venv``:

    python3 -m venv /tmp/embedvenv
    /tmp/embedvenv/bin/pip install fastembed
    /tmp/embedvenv/bin/python scripts/build_note_embeddings.py

Outcome sentences are embedded too, but seeding only uses the observed
sentences; they are stored so the build is complete if that ever changes.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "simulator" / "fintech_demo" / "generators" / "a3_fraud.py"
OUTPUT = ROOT / "simulator" / "fintech_demo" / "data" / "note_sentence_embeddings.json"
MODEL = "sentence-transformers/all-MiniLM-L6-v2"
SENTENCE_TABLES = ("REASON_NOTE_SENTENCES", "OUTCOME_NOTE_SENTENCES")


def note_sentences() -> list[str]:
    """Read the sentence tables without importing the simulator's dependencies."""
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    sentences: list[str] = []
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id in SENTENCE_TABLES:
                for variants in ast.literal_eval(node.value).values():
                    sentences.extend(variants)
    return list(dict.fromkeys(sentences))


def main() -> None:
    import numpy as np
    from fastembed import TextEmbedding

    sentences = note_sentences()
    model = TextEmbedding(MODEL)
    vectors = {}
    for sentence, vector in zip(sentences, model.embed(sentences)):
        unit = vector / np.linalg.norm(vector)
        vectors[sentence] = [round(float(value), 6) for value in unit]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {"model": MODEL, "dimensions": len(next(iter(vectors.values()))), "sentences": vectors},
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(vectors)} sentence vectors to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
