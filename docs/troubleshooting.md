# Troubleshooting

Ordered by when you are likely to hit it. If you are mid-demo, go to
[Recovering mid-demo](runbook.md#recovering-mid-demo) in the runbook first;
this document is for fixing causes, not for surviving the next five minutes.

Two commands answer most questions:

```bash
cd simulator
python -m fintech_demo preflight    # is the demo definition sound (no database)
python -m fintech_demo doctor       # is the workspace reachable and capable
```

## Cannot reach the database

### `cannot resolve <host>`

The workspace endpoint does not exist in DNS. Almost always the workspace is
suspended or was deleted, or `DEMO_DB_HOST` is stale.

Open the SingleStore portal, resume or recreate the workspace, then copy its
current endpoint into `DEMO_DB_HOST` in `app/.env.local`. Free and trial
workspaces suspend on their own after a period of inactivity, so this is the
most common failure when returning to a demo after a break.

### `cannot connect to <host>:<port>`

The name resolves but the connection was refused. Check, in this order:

1. Your public IP is on the workspace firewall allowlist. This changes when you
   change networks or VPN.
2. `DEMO_DB_PORT` is the port the portal shows, usually `3306`.
3. `DEMO_DB_USER` and `DEMO_DB_PASSWORD` are correct and the user is not locked.

### `Access denied` while migrating

The first run creates the database, which needs `CREATE DATABASE`. Either grant
it, or create `fintech_demo` by hand and re-run `migrate`.

## Nothing on screen

### Every widget shows an empty state

There is no active run. Check:

```bash
python -m fintech_demo status
```

If it reports no active run, `python -m fintech_demo reset` clones the template
and activates one. If it reports that no template exists, you have not seeded:
run `bootstrap`.

### The logical clock is not advancing

The simulator process is not running, or it is not the leader. Start it:

```bash
python -m fintech_demo run
```

Only one simulator may run per database. If you started two, stop one: they will
contend for the same commands and the clock will appear to stutter.

### Widgets show data but the clock is frozen

That is a pause, and it is deliberate. Widgets read
`demo_active_run.logical_time`, so a paused stream freezes every number rather
than showing a moving wall-clock window. Resume from the control strip.

## Reset problems

### Reset is rejected with a checksum mismatch

The clone of the template did not reproduce the recorded baseline fingerprint.
This is the mechanism working, not failing: something wrote to the demo database
outside the simulator.

Investigate before repairing, because the usual cause is worth knowing about:

1. Is the Aura workspace attached read-write instead of read-only? A generated
   query can then write to the run. Fix the attachment.
2. Did someone run SQL against `fintech_demo` by hand?
3. Did `DEMO_DEFAULT_SEED`, `DEMO_DEFAULT_EPOCH`, or `DEMO_BASELINE_DAYS` change
   since seeding? Any of those changes the data, so the old fingerprint no longer
   applies.

If the configuration genuinely changed, re-seed:

```bash
python -m fintech_demo seed --update-baseline
python -m fintech_demo verify --scenario A2_PROCESSOR_TIMEOUT --inject
```

`--update-baseline` rewrites the recorded fingerprint in `fixtures/baseline/`, so
only use it once you know why the old one no longer applies. Never do this
mid-demo.

### Reset is slow

Reset clones the template server-side, so it should take seconds. If it takes
minutes, the template is missing and the run is being generated from scratch.
Check that run `0` exists; re-`seed` if not.

## Scenario problems

### Injection returns "already injected"

Scenarios are injected once per run. Reset, then inject again.

### The scenario fired but the numbers did not move

Check the window. The scenario is a two-minute burst on one processor and one
lane, so an hour-grain view dilutes it. The lane table and **What changed** panel
isolate it; the 24-hour overview intentionally does not.

If **What changed** shows measured values that do not match the published
expectation, stop trusting the environment and run `verify` after the session.
That panel disagreeing with the contract is the one symptom that means the data
itself is wrong.

### `verify` fails on the baseline

The generated data does not match its published contract. Confirm
`DEMO_DEFAULT_SEED`, `DEMO_DEFAULT_EPOCH`, and `DEMO_BASELINE_DAYS` match what the
baseline fingerprint in
`fixtures/baseline/` was recorded with. If they do and it still fails, the
generator changed: run `python -m pytest simulator/tests -q`, which localises the
break far better than the database round trip.

## Analyst problems

### Every answer says it is a reviewed fixture

That is expected when:

- `ANALYST_MODE=fixture`, or the control-strip selector is **Fixture**, or
- `auto` mode has no Domain key for the anchor (`ANALYST_A{N}_API_KEY` empty), or
- a live call failed and auto fell back.

Fixtures are real reviewed answers. The turn is labelled **Reviewed fixture**
(with `live Domain not keyed` or the live error when relevant). Only **live**
mode fails hard when Aura is missing.

### Live Domain keys missing (`all_live_domains` fail on `/admin`)

Domains must be **published** in Portal, then each Domain-scoped key stored only
in ignored `app/.env.local` as `ANALYST_A1_API_KEY` … `ANALYST_A8_API_KEY`.
Never paste key values into chat, logs, screenshots, or commits.

Until keys exist, keep `ANALYST_MODE=auto` or `fixture` and present with
reviewed fixtures. `all_live_domains` stays incomplete until every available
anchor is published and keyed — that check is accurate by design and does not
block fixture/auto demo readiness.

### Live calls fail with 401 or 403

`ANALYST_A{N}_API_KEY` is missing, expired, or scoped to a different Domain. Keys
are Domain-scoped by design; a key for another Domain will authenticate and then
fail to find the tables.

### Live chat says "cookie not found" then falls back to a fixture

Usually one of:

1. `ANALYST_A{N}_ENDPOINT` was pasted as the full `/chat` URL. The app appends
   `/chat` itself, so the request hit `…/chat/chat`. Set the endpoint to the
   Analyst base (`…/analyst`) or leave it blank and rely on
   `ANALYST_ORG_ID` / `ANALYST_PROJECT_ID` / `ANALYST_REGION`.
2. A previous Aura conversation `session_id` went stale (Domain republished,
   key rotated, or app restarted mid-thread). The proxy now clears that session
   and retries once without it; if live still fails, auto mode falls back to
   the reviewed fixture and labels the turn clearly.

Restart the Next.js process after editing `.env.local`, then ask again.

### Live answer shows SingleStore error 1706 (`GROUP_CONCAT` / `DISTINCT`)

Aura sometimes generates MySQL-shaped SQL that SingleStore rejects:

`Feature 'GROUP_CONCAT with ORDER BY mixed with DISTINCT aggregates' is not supported`

The app appends a SingleStore SQL constraint on every live chat prompt and
retries once with a stronger hint when that error appears. Re-ask the question
after a refresh if you still see it.

For a lasting fix, republish Domain instructions from
`domains/a7-credit-risk/manifest.yaml` (context_version `1.1.0`+), which tells
Analyst to use detail-row `SELECT`s on `aa_credit_application_evidence` and
never `GROUP_CONCAT`.

### Live calls fail with 404 on the Domain

The Domain does not exist, or its name does not match the manifest's
`domain_name`. Build it with
[`domain-setup-checklist.md`](domain-setup-checklist.md).

### Answers are wrong rather than absent

This is Domain context, not code. The symptom table at the end of
[`domain-setup-checklist.md`](domain-setup-checklist.md) maps each wrong-answer
shape to the piece of context that is missing. Percentages 100× too large,
"no data" for recent periods, and totals that match no widget are all context
problems with known fixes.

### No fixture covers a question

Fixture mode says so plainly rather than inventing an answer. Ask one of the
starter questions instead, or add a fixture:

```bash
python scripts/build_fixtures.py
```

Fixtures are generated from the same generator that produces the database rows,
so their numbers agree with the dashboard by construction. Do not hand-edit
them; edit the builder and regenerate, then confirm with `--check`.

## App problems

### `npm run build` fails on a type error

Run `npm --prefix app run typecheck` for the full message. The app is strict on
purpose: a widget that compiles against the wrong row shape is a wrong number on
screen.

### `npm run scan:bundle` reports a leak

A credential reached the client bundle. Find the file it names and move the
access behind a route handler or a server component. Nothing under
`app/src/lib/env.ts` may be imported by a client component; that module is
server-only by convention, and this scan is what enforces it.

### Controls return 403

`DEMO_ADMIN_TOKEN` is set and the browser does not have it. Enter it in the app,
or clear the variable for local use. An empty token means anyone who can reach
the app can drive the demo, which the launchpad flags with an "open demo" badge.

## When you are stuck

Capture these before resetting anything, then reset:

- `python -m fintech_demo status`
- `/admin` and `/admin/data`, which show live row counts against recorded ones
- the simulator terminal output

`/admin/data` is the most useful of the three: it compares what the database
actually holds against what the run recorded, which separates "the simulator
stopped" from "the widget query is wrong".
