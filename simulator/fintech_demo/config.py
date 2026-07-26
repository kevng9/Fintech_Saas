"""Runtime configuration for the seeder and simulator processes.

Secrets are read from the environment only. The same ``.env.local`` file backs
the Next.js app and this package so a demo environment is described once.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

FIXTURE_VERSION = "1.1.0"
DEFAULT_SEED = 20260725
DEFAULT_EPOCH = "2026-07-25T09:00:00Z"
DEFAULT_BASELINE_DAYS = 7
DEFAULT_ALLOWED_SPEEDS = (0.5, 1.0, 2.0, 5.0, 20.0)

TEMPLATE_RUN_ID = 0

APP_ENV_FILE = Path(__file__).resolve().parents[2] / "app" / ".env.local"


def load_env_file(path: Path | str | None = None) -> None:
    """Load KEY=VALUE lines into os.environ without overwriting real env vars."""
    env_path = Path(path) if path else APP_ENV_FILE
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def parse_epoch(value: str) -> datetime:
    text = value.strip()
    if text.lower() == "now":
        now = datetime.now(timezone.utc)
        return now.replace(minute=0, second=0, microsecond=0, tzinfo=None)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed.replace(second=0, microsecond=0)


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    user: str
    password: str
    database: str
    seed: int
    epoch: datetime
    baseline_days: int
    fixture_version: str = FIXTURE_VERSION
    allowed_speeds: tuple[float, ...] = field(default=DEFAULT_ALLOWED_SPEEDS)
    heartbeat_seconds: float = 5.0
    heartbeat_grace_seconds: float = 15.0
    tick_seconds: float = 0.5

    @property
    def dsn_label(self) -> str:
        """Connection label safe to log: never includes the password."""
        return f"{self.user}@{self.host}:{self.port}/{self.database}"


def settings_from_env(
    env_file: Path | str | None = None,
    *,
    database: str | None = None,
    seed: int | None = None,
    epoch: str | None = None,
    baseline_days: int | None = None,
) -> Settings:
    load_env_file(env_file)
    missing = [
        name
        for name in ("DEMO_DB_HOST", "DEMO_DB_USER", "DEMO_DB_PASSWORD")
        if not os.environ.get(name)
    ]
    if missing:
        raise SystemExit(
            "Missing required environment variables: "
            + ", ".join(missing)
            + ". Copy app/.env.local.example to app/.env.local and fill it in."
        )
    return Settings(
        host=os.environ["DEMO_DB_HOST"],
        port=int(os.environ.get("DEMO_DB_PORT", "3306")),
        user=os.environ["DEMO_DB_USER"],
        password=os.environ["DEMO_DB_PASSWORD"],
        database=database or os.environ.get("DEMO_DB_NAME", "fintech_demo"),
        seed=seed if seed is not None else int(os.environ.get("DEMO_DEFAULT_SEED", DEFAULT_SEED)),
        epoch=parse_epoch(epoch or os.environ.get("DEMO_DEFAULT_EPOCH", DEFAULT_EPOCH)),
        baseline_days=baseline_days
        if baseline_days is not None
        else int(os.environ.get("DEMO_BASELINE_DAYS", DEFAULT_BASELINE_DAYS)),
    )
