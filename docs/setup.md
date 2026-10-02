# Setup

First-time setup of a demo environment. Budget about 45 minutes, most of it
waiting on SingleStore provisioning and building the Aura Domain by hand.

## 1. Prerequisites

- Python 3.11 or newer
- Node 20 or newer
- A SingleStore Helios organization where you can create workspaces and Aura
  Domains
- Your machine's public IP on the workspace firewall allowlist

## 2. SingleStore topology

Create this once. The separation matters: Aura Analyst gets its own compute so
that a heavy generated query cannot slow the simulator or the dashboard.

1. **Read-write workspace** — the simulator and the app connect here. Any small
   size is enough for this data volume.
2. **Database `fintech_demo`** — created for you by `bootstrap`; you only need
   permission to create it.
3. **Aura Analyst workspace** — a second workspace in the same workspace group,
   attached to `fintech_demo` **read-only**. Aura runs its generated SQL here.

Confirm the attachment is read-only before continuing. If Aura can write to the
demo database, a generated query can corrupt the run mid-presentation and the
reset checksum will start failing.

## 3. Configure the environment

```bash
cp app/.env.local.example app/.env.local
```

Fill in `app/.env.local`. Both the app and the simulator read this file, so
there is exactly one place to edit.

| Variable | Required | Notes |
| --- | --- | --- |
| `DEMO_DB_HOST` | yes | Read-write workspace endpoint, no port |
| `DEMO_DB_PORT` | yes | Usually `3306` |
| `DEMO_DB_USER`, `DEMO_DB_PASSWORD` | yes | Needs `CREATE DATABASE` on first run |
| `DEMO_DB_NAME` | yes | `fintech_demo` |
| `DEMO_DEFAULT_SEED` | yes | Changing this changes every generated number |
| `DEMO_DEFAULT_EPOCH` | yes | Logical "now" at seed time, UTC |
| `DEMO_BASELINE_DAYS` | yes | `7`; how much history to seed |
| `DEMO_ALLOWED_SPEEDS` | yes | Speeds offered in the control strip |
| `DEMO_ADMIN_TOKEN` | for hosted | Empty means anyone can drive the controls |
| `ANALYST_MODE` | yes | `auto`, `live`, or `fixture` |
| `ANALYST_ORG_ID`, `ANALYST_PROJECT_ID`, `ANALYST_REGION` | for live | From the Aura Analyst API settings |
| `ANALYST_A1_API_KEY` … `ANALYST_A8_API_KEY` | for live | **Domain-scoped** key per anchor Domain |
| `ANALYST_A{N}_ENDPOINT` | no | Overrides the Analyst **base** URL (`…/analyst`). Do not include `/chat` — the app appends paths |

Never commit `app/.env.local`. It is in `.gitignore`; keep it that way.

The customer demo ships with `ANALYST_MODE=live`. While that value is set, the
server uses Aura and ignores a browser request to replay a stored answer.
`fixture` and `auto` remain available for a build without Domain keys. In those
modes the dashboard is still live and a stored answer is labeled on screen.
`all_live_domains` on `/admin` stays incomplete until Domains are published and
keyed — that is intentional and does not block fixture or auto development.

A customer story pauses the logical clock when it injects. Resume from the
operator view after the story, or after a reset, when the baseline should move
again.

## 4. Python environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r simulator/requirements.txt
```

## 5. Validate before touching the database

```bash
cd simulator
python -m fintech_demo preflight
```

This parses every migration, checks that each curated view is run-scoped, and
proves the generator is deterministic and produces each scenario's published
event count. It never connects to the workspace, so a failure here is a problem
with the demo definition rather than your environment.

Then check the workspace itself:

```bash
python -m fintech_demo doctor
```

`doctor` reports whether the host resolves, whether credentials work, and
whether the engine supports the SQL the views need. Fix anything it reports
before seeding.

## 6. Create and seed the database

```bash
python -m fintech_demo bootstrap
```

`bootstrap` runs `migrate`, then `seed`, then activates a run. Seeding writes
seven logical days into template run `0`, records the baseline fingerprint and
checksum to `fixtures/baseline/`, and clones the template into run `1`.

Expect a few minutes. The template is written once; every later reset is a
server-side clone of it, which is why reset is fast.

## 7. Prove the data matches its contract

```bash
python -m fintech_demo verify --scenario A2_PROCESSOR_TIMEOUT --inject
```

This asserts the baseline metrics and the recorded checksum, injects the
scenario, asserts the published post-injection deltas exactly, and then resets
the run back to its verified baseline. Expect 19 of 19 checks to pass.

If this fails, the numbers on screen will not match what you say during the
demo, so do not present until it passes.

Without `--inject` the command checks whatever state the run is already in,
which is what you want after injecting from the app. Do not use `--inject` while
the simulator is running; it refuses rather than race the leader.

## 8. Start the two processes

From the repository root, `scripts/startup.sh` does this and resumes the stream.
`scripts/shutdown.sh` stops both processes and restores the verified baseline.
To start them yourself:

```bash
# terminal 1
cd simulator && python -m fintech_demo run

# terminal 2
cd app && npm install && npm run dev
```

## 9. Build the Aura Domain

Only needed for live Analyst mode. Follow
[`domain-setup-checklist.md`](domain-setup-checklist.md), then validate with
`/admin/domain-check`.

## 10. Record what you deployed

Update `environment-manifest.yaml` with the workspace names, the recorded
baseline checksum, and the Domain context version. Domain context is applied by
hand in Creator Mode and is not otherwise version controlled, so this file is
the only record of what a given environment is actually running.

## Docker alternative

```bash
cd deploy
docker compose up --build
```

Compose runs `bootstrap` once, then starts the simulator and the app together.
It reads the same `app/.env.local`, so configure that first.
