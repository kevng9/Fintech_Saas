"""Guards on the Aura Domain manifests and the reviewed fixtures.

A Domain's context is applied by hand in Creator Mode, so the manifest is the
only reviewable record of what Analyst was told. These tests keep it honest
against the things it must agree with: the curated views in the migrations, the
known-question suite the app runs at ``/admin/domain-check``, and the fixtures
that stand in for Analyst when it is unreachable.

Every anchor (A1-A8) ships a manifest, a slice of the known-question suite, and
a fixture directory, so every check below runs once per anchor rather than
being hardcoded to A2.

The manifests are small and PyYAML is not a runtime dependency of the simulator,
so the few fields under test are read with targeted regular expressions rather
than a parser.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from fintech_demo.db import MIGRATIONS_DIR, split_statements

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFESTS = sorted((REPO_ROOT / "domains").glob("*/manifest.yaml"))
KNOWN_QUESTIONS_TS = REPO_ROOT / "app" / "src" / "lib" / "anchors" / "knownQuestions.ts"
FIXTURES_ROOT = REPO_ROOT / "fixtures" / "analyst"

ANCHOR_IDS = [
    re.search(r"^anchor: (\w+)", path.read_text(encoding="utf-8"), re.MULTILINE).group(1)
    for path in MANIFESTS
]

# Matching threshold in app/src/lib/analyst/fixtures.ts. Kept in sync by
# test_fixture_matching_threshold_is_unchanged below.
FIXTURE_MATCH_THRESHOLD = 0.34


def manifest_path(anchor: str) -> Path:
    for path in MANIFESTS:
        if path.parent.name.startswith(f"{anchor}-"):
            return path
    raise AssertionError(f"no manifest found for anchor {anchor}")


def manifest_text(anchor: str) -> str:
    return manifest_path(anchor).read_text(encoding="utf-8")


def manifest_table_blocks(anchor: str) -> dict[str, str]:
    """Map each documented table name to its block of the manifest."""
    body = manifest_text(anchor)
    start = body.index("\ntables:")
    end = body.index("\nrelationships:", start)
    blocks: dict[str, str] = {}
    for chunk in re.split(r"\n  - name: ", body[start:end])[1:]:
        name, _, rest = chunk.partition("\n")
        blocks[name.strip()] = rest
    return blocks


def manifest_question_ids(anchor: str) -> list[str]:
    body = manifest_text(anchor)
    return re.findall(r"^  - id: (\w+)", body[body.index("\nknown_questions:") :], re.MULTILINE)


def manifest_questions(anchor: str) -> list[str]:
    body = manifest_text(anchor)
    return [
        text.strip()
        for text in re.findall(
            r"^    question: (.+)$", body[body.index("\nknown_questions:") :], re.MULTILINE
        )
    ]


def all_manifest_questions() -> list[tuple[str, str]]:
    """(anchor, question) pairs across every manifest, for parametrized tests."""
    return [(anchor, question) for anchor in ANCHOR_IDS for question in manifest_questions(anchor)]


def migration_views() -> dict[str, str]:
    sql = "\n".join(
        path.read_text(encoding="utf-8") for path in sorted(MIGRATIONS_DIR.glob("*.sql"))
    )
    views: dict[str, str] = {}
    for statement in split_statements(sql):
        match = re.match(r"CREATE VIEW (\w+)", statement.strip(), re.IGNORECASE)
        if match:
            views[match.group(1)] = statement
    return views


def top_level_select_columns(statement: str) -> set[str]:
    """Column aliases from every top-level SELECT clause of a view, ignoring
    aliases introduced inside nested subqueries (derived tables) so a "latest
    row per group" join pattern does not look like an extra output column."""
    columns: set[str] = set()
    depth = 0
    i = 0
    in_select_clause = False
    clause_start = 0
    length = len(statement)
    while i < length:
        char = statement[i]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif depth == 0:
            if not in_select_clause and re.match(r"SELECT\b", statement[i:], re.IGNORECASE):
                in_select_clause = True
                clause_start = i + len("SELECT")
                i += len("SELECT")
                continue
            if in_select_clause and re.match(r"FROM\b", statement[i:], re.IGNORECASE):
                columns |= set(re.findall(r"AS (\w+)", statement[clause_start:i]))
                in_select_clause = False
        i += 1
    return columns


def fixtures(anchor: str) -> list[dict]:
    fixture_dir = FIXTURES_ROOT / anchor
    return [
        json.loads(path.read_text(encoding="utf-8")) for path in sorted(fixture_dir.glob("*.json"))
    ]


def tokens(text: str) -> set[str]:
    """Port of ``tokens`` in app/src/lib/analyst/fixtures.ts."""
    cleaned = re.sub(r"[^a-z0-9 ]", " ", text.lower())
    return {token for token in cleaned.split() if len(token) > 2}


def match_score(question: str, fixture: dict) -> float:
    """Port of ``score`` in app/src/lib/analyst/fixtures.ts."""
    asked = tokens(question)
    target = tokens(" ".join([fixture["prompt"], *fixture["match"]]))
    if not asked or not target:
        return 0.0
    return len(asked & target) / len(asked)


def resolves(anchor: str, question: str, state: str) -> bool:
    """Whether fixture mode would answer ``question`` in the given demo state."""
    anchor_fixtures = fixtures(anchor)
    eligible = [f for f in anchor_fixtures if f["scenario_state"] in {state, "any"}] or anchor_fixtures
    if any(f["prompt"].strip().lower() == question.strip().lower() for f in eligible):
        return True
    return max((match_score(question, f) for f in eligible), default=0.0) >= FIXTURE_MATCH_THRESHOLD


@pytest.mark.parametrize("anchor", ANCHOR_IDS)
def test_manifest_tables_all_exist_as_curated_views(anchor: str) -> None:
    """A Domain pointed at a renamed view fails only when a question is asked."""
    views = migration_views()
    for name in manifest_table_blocks(anchor):
        assert name.startswith("aa_"), f"{name} is not a curated view"
        assert name in views, f"{name} is documented but not created by any migration"


@pytest.mark.parametrize("anchor", ANCHOR_IDS)
def test_manifest_documents_every_column_its_views_select(anchor: str) -> None:
    """An undocumented column is one Analyst has to guess the meaning of."""
    views = migration_views()
    for name, block in manifest_table_blocks(anchor).items():
        documented = set(re.findall(r"^      (\w+):", block, re.MULTILINE))
        selected = top_level_select_columns(views[name])
        assert selected, f"could not read the select list of {name}"
        assert selected <= documented, f"{name} undocumented columns: {sorted(selected - documented)}"


@pytest.mark.parametrize("anchor", ANCHOR_IDS)
def test_manifest_never_exposes_a_control_table(anchor: str) -> None:
    """Analyst sees curated views only; control tables are the app's business."""
    for name in manifest_table_blocks(anchor):
        assert not name.startswith("demo_")


def test_manifest_credentials_are_server_side_names_only() -> None:
    """A NEXT_PUBLIC_ key name would ship the credential to the browser."""
    for path in MANIFESTS:
        body = path.read_text(encoding="utf-8")
        secrets = re.findall(r"^(?:key|endpoint)_secret: (\S+)", body, re.MULTILINE)
        assert secrets, f"{path} names no key secret"
        for name in secrets:
            assert not name.startswith("NEXT_PUBLIC_"), name


def test_known_question_ids_match_the_app_suite() -> None:
    """/admin/domain-check is the validation gate; it must test what was published."""
    ts = KNOWN_QUESTIONS_TS.read_text(encoding="utf-8")
    entries = re.findall(r'id: "(\w+)",\s*\n\s*anchorId: "(\w+)",', ts)
    assert entries, "no question ids found in knownQuestions.ts"
    app_ids_by_anchor: dict[str, list[str]] = {}
    for question_id, anchor_id in entries:
        app_ids_by_anchor.setdefault(anchor_id, []).append(question_id)

    assert set(app_ids_by_anchor) == set(ANCHOR_IDS), (
        f"knownQuestions.ts anchors {sorted(app_ids_by_anchor)} do not match "
        f"domains/*/manifest.yaml anchors {sorted(ANCHOR_IDS)}"
    )
    for anchor in ANCHOR_IDS:
        assert app_ids_by_anchor[anchor] == manifest_question_ids(anchor), anchor


def test_known_questions_match_the_manifest_verbatim() -> None:
    """Rewording a question silently invalidates its recorded expectations."""
    ts = KNOWN_QUESTIONS_TS.read_text(encoding="utf-8")
    blocks = re.findall(
        r'anchorId: "(\w+)",\s*\n\s*question:\s*((?:\s*"[^"]*"\s*\+?)+),', ts
    )
    assert blocks, "no known questions found in knownQuestions.ts"
    app_questions_by_anchor: dict[str, list[str]] = {}
    for anchor_id, chunk in blocks:
        question = "".join(re.findall(r'"([^"]*)"', chunk))
        app_questions_by_anchor.setdefault(anchor_id, []).append(question)

    for anchor in ANCHOR_IDS:
        assert app_questions_by_anchor[anchor] == manifest_questions(anchor), anchor


@pytest.mark.parametrize("anchor", ANCHOR_IDS)
def test_starter_prompts_are_answerable_from_fixtures(anchor: str) -> None:
    """Starters are one click away, so fixture mode must never miss one."""
    body = manifest_text(anchor)
    block = body[body.index("\nstarter_prompts:") : body.index("\nknown_questions:")]
    starters = re.findall(r"^  - (.+)$", block, re.MULTILINE)
    assert starters
    for starter in starters:
        for state in ("baseline", "after_injection"):
            assert resolves(anchor, starter, state), f"no fixture for starter in {state}: {starter}"


@pytest.mark.parametrize("anchor, question", all_manifest_questions(), ids=lambda v: v if isinstance(v, str) else None)
def test_every_known_question_is_answerable_from_fixtures(anchor: str, question: str) -> None:
    """Fixture mode is the fallback during a live demo; the suite must still pass."""
    assert resolves(anchor, question, "after_injection"), question


def test_fixture_matching_threshold_is_unchanged() -> None:
    """These tests reimplement the app's matcher, so pin the constant they share."""
    source = (REPO_ROOT / "app" / "src" / "lib" / "analyst" / "fixtures.ts").read_text("utf-8")
    match = re.search(r"best\.value >= ([\d.]+)", source)
    assert match, "fixture match threshold not found"
    assert float(match.group(1)) == FIXTURE_MATCH_THRESHOLD


def all_fixture_paths() -> list[Path]:
    return sorted(FIXTURES_ROOT.glob("*/*.json"))


@pytest.mark.parametrize("path", all_fixture_paths(), ids=lambda p: f"{p.parent.name}/{p.stem}")
def test_fixtures_are_well_formed(path: Path) -> None:
    """A malformed fixture is skipped silently at runtime, so catch it here."""
    anchor = path.parent.name
    fixture = json.loads(path.read_text(encoding="utf-8"))
    assert fixture["id"] == path.stem
    assert fixture["anchor"] == anchor
    assert fixture["scenario_state"] in {"baseline", "after_injection", "any"}
    assert fixture["prompt"].strip()
    assert fixture["results"], "a fixture with no result renders as an empty answer"
    for result in fixture["results"]:
        assert result["text"].strip()
        table = result.get("table")
        if table:
            assert table["columns"]
            assert all(len(row) == len(table["columns"]) for row in table["rows"])
            assert table["row_count"] >= len(table["rows"])
        sql = result.get("sql")
        if sql:
            # Fixtures show their SQL in the same panel as live answers, and that
            # SQL is the provenance claim, so it must read curated views only.
            assert sql["command"].strip()
            assert sql["tables_used"]
            for table_name in sql["tables_used"]:
                assert table_name.startswith("aa_"), table_name
                assert table_name in manifest_table_blocks(anchor)


@pytest.mark.parametrize("anchor", ANCHOR_IDS)
def test_fixtures_cover_both_demo_states(anchor: str) -> None:
    states = {fixture["scenario_state"] for fixture in fixtures(anchor)}
    assert {"baseline", "after_injection"} <= states


@pytest.mark.parametrize("anchor", ANCHOR_IDS)
def test_fixture_versions_agree_with_the_manifest(anchor: str) -> None:
    published = re.search(r"^fixture_version: (\S+)", manifest_text(anchor), re.MULTILINE)
    assert published
    for fixture in fixtures(anchor):
        assert fixture["fixture_version"] == published.group(1)


def test_all_manifests_name_a_domain_and_an_anchor() -> None:
    assert MANIFESTS, "no Domain manifests found"
    for path in MANIFESTS:
        body = path.read_text(encoding="utf-8")
        assert re.search(r"^domain_name: \w+", body, re.MULTILINE), path
        assert re.search(r"^anchor: \w+", body, re.MULTILINE), path
        assert re.search(r"^context_version: \S+", body, re.MULTILINE), path


def test_every_anchor_has_a_fixture_directory() -> None:
    for anchor in ANCHOR_IDS:
        fixture_dir = FIXTURES_ROOT / anchor
        assert fixture_dir.is_dir(), f"no fixture directory for anchor {anchor}"
        assert list(fixture_dir.glob("*.json")), f"no fixtures for anchor {anchor}"
