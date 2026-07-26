# Fintech Aura Analyst Modular Demo

A modular demonstration of SingleStore Aura Analyst for fintech, built on
synthetic, continuously generated, deterministic, resettable data.

This build ships all eight fintech anchors end to end. They share one
deterministic control plane and global reset while each anchor has its own
scenario, curated views, evidence path, Analyst fixtures, and Domain manifest.

## What is here

| Path | Purpose |
| --- | --- |
| `app/` | Next.js application: UI, deterministic widget SQL, Aura Analyst proxy, control-plane writer |
| `simulator/` | Python package: deterministic generator, seeder, scenario injection, reset, CLI |
| `database/migrations/` | Control tables, shared dimensions, A1–A8 facts, curated `aa_*` views |
| `domains/` | Aura Domain manifests: the source of intent for Creator Mode |
| `fixtures/analyst/` | Reviewed Analyst answers used when Aura is unreachable |
| `fixtures/baseline/` | Versioned expected baseline fingerprint and checksum |
| `scripts/` | Fixture builder and client-bundle secret scanner |
| `docs/` | Setup, runbook, troubleshooting, Domain checklist |
| `deploy/` | Docker Compose for app plus simulator |

## Quick start

Requires Python 3.11+, Node 20+, and a SingleStore workspace you can reach.

```bash
# 1. Configure the environment (never commit this file)
cp app/.env.local.example app/.env.local
$EDITOR app/.env.local          # set DEMO_DB_* and, for live Analyst, ANALYST_*

# 2. Python environment
python3 -m venv .venv && source .venv/bin/activate
pip install -r simulator/requirements.txt

# 3. Validate the demo definition without touching the database
cd simulator
python -m fintech_demo preflight

# 4. Confirm the workspace supports the SQL the views need
python -m fintech_demo doctor

# 5. Create the database, seed the template, activate a run
python -m fintech_demo bootstrap

# 6. Prove each scenario matches its published contract
for scenario in A1_REVIEW_SPIKE A2_PROCESSOR_TIMEOUT A3_LOSS_CLUSTER \
  A4_CORRESPONDENT_SPIKE A5_CASE_SURGE A6_SETTLEMENT_DELAY \
  A7_PENDING_EXPOSURE A8_DINING_SPIKE; do
  python -m fintech_demo verify --scenario "$scenario" --inject
done

# 7. Start the event stream (leave running)
python -m fintech_demo run

# 8. In another terminal, from the repository root, start the app
cd app && npm install && npm run dev
```

Then open <http://localhost:3000>, and check `/admin` shows every pre-flight
check passing before you present.

## How the demo runs

Two processes and one database:

- **Next.js** serves the UI, computes every widget with its own SQL, proxies
  Aura Analyst, and writes control commands. It holds all credentials.
- **The Python simulator** is the single leader that advances the logical clock,
  emits events, injects scenarios, and performs resets. It polls `demo_command`
  for work.
- **SingleStore** holds the synthetic world, the curated views Aura reads, and
  the control tables the two processes coordinate through.

The browser never holds a credential and never calls Aura directly.

## Reproducibility

Every row is a pure function of `(seed, run, logical minute, position)`, so the
same seed and epoch reproduce the same data in the same order regardless of
pacing or restarts. `python -m fintech_demo seed` records a fingerprint and a
SHA-256 checksum; a reset clones the template run and is **rejected** unless the
clone reproduces that checksum exactly.

Widgets and views filter on `demo_active_run.logical_time`, not the wall clock,
so pausing the simulator genuinely freezes every number on screen.

## Live and fixture modes

`ANALYST_MODE` and the in-app Analyst selector control where answers come from:

- `live` calls Aura Analyst and surfaces a failure rather than hiding it.
- `fixture` always replays a reviewed stored answer.
- `auto` tries live first and falls back to a fixture, labelled on screen.

Fixtures are generated from the same generator that produces the database rows,
so their numbers agree with the dashboard:

```bash
python scripts/build_fixtures.py           # regenerate
python scripts/build_fixtures.py --check   # fail if stale
```

## Verification

From the repository root:

```bash
python scripts/build_fixtures.py --check           # fixtures match the generator
npm --prefix app run lint
npm --prefix app run typecheck
npm --prefix app run build
npm --prefix app run scan:bundle                   # no secret in the client bundle
```

From `simulator/`, where the package and its tests resolve:

```bash
python -m fintech_demo preflight                   # migrations and generator, no database
python -m pytest tests -q                          # determinism and exact metrics
python -m fintech_demo verify --scenario <SCENARIO_ID> --inject          # against the workspace
```

## Security

- All secrets are server-side only. No `NEXT_PUBLIC_*` variable carries one.
- Aura Analyst reads only the curated `aa_*` views, scoped to the active run and
  the logical clock. It cannot read control tables and cannot write.
- Demo controls require the administrator role. Leaving `DEMO_ADMIN_TOKEN` empty
  is fine on a laptop and never fine on a hosted URL; the launchpad shows an
  "open demo" badge when it is empty.
- All data is synthetic. There is no card number, token, credential, or real
  customer identity anywhere in this repository or in anything it generates.

## Documentation

- [`docs/setup.md`](docs/setup.md) — first-time environment setup
- [`docs/database-resources.md`](docs/database-resources.md) — complete database, key, view, and Aura Domain inventory
- [`docs/domain-setup-checklist.md`](docs/domain-setup-checklist.md) — building each anchor's Aura Domain
- [`docs/demo-script.md`](docs/demo-script.md) — word-for-word 10-minute presenter script
- [`docs/anchor-catalog.md`](docs/anchor-catalog.md) — all eight anchor stories, scenarios, evidence paths, and delivery status
- [`docs/runbook.md`](docs/runbook.md) — operating and recovering the demo
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — what to do when something breaks
- [`docs/adding-an-anchor.md`](docs/adding-an-anchor.md) — extending the registry with another anchor
- [`environment-manifest.yaml`](environment-manifest.yaml) — what is actually deployed
