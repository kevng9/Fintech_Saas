# Adding an anchor

A2 Payment Pulse is built end to end so that the remaining anchors are additive.
Nothing in the foundation is A2-specific: the control plane, the logical clock,
reset, the Aura proxy, live and fixture modes, and the admin pages all key off an
anchor id.

Adding an anchor means adding data, curated views, a Domain manifest, widgets,
and a scenario. It does not mean touching the foundation. If you find yourself
editing the simulator loop or the reset path, stop: that is a sign the anchor is
being modelled in the wrong place.

## The shape of one anchor

| Piece | Where |
| --- | --- |
| Fact tables and dimensions | `database/migrations/00N_<anchor>.sql` |
| Curated `aa_*` views | same migration |
| Generator | `simulator/fintech_demo/generator.py` and `model.py` |
| Scenario | `simulator/fintech_demo/scenarios/<id>.py` |
| Expected metrics | the scenario's `expected_deltas` |
| Domain manifest | `domains/<anchor>-<slug>/manifest.yaml` |
| Known questions | `app/src/lib/anchors/knownQuestions.ts` |
| Fixtures | `fixtures/analyst/<anchor>/`, built by `scripts/build_fixtures.py` |
| Widget SQL | `app/src/lib/metrics/<anchor>.ts` |
| Pages | `app/src/app/anchors/<anchor>/` |
| Registration | `app/src/lib/anchors/index.ts` |

## Order of work

Do it in this order. Each step is verifiable before the next one exists, which is
what keeps a wrong number from surviving to the screen.

### 1. Write the story first

An anchor is a business narrative, not a dataset. Before any code, write down the
job title, the business issue, the question the audience will ask, the moment
something changes, and the single sentence they should leave with. If the change
is not visible in one widget within two seconds of injection, the story is wrong,
and no amount of implementation fixes that.

### 2. Model the data

Add tables to a new migration. Keep the run-scoping convention: every fact table
carries `run_id`, and every row's logical time comes from the generator, never
from `NOW()`.

Add the generator so every row is a pure function of
`(seed, run id, logical minute, position)`. This is what makes the demo
reproducible; a single call to `random.random()` without the seeded PRNG breaks
reset, `verify`, and fixture agreement at the same time.

### 3. Write the curated views

Every `aa_*` view must join `demo_active_run` and filter on both the active run
and `logical_time`. `preflight` fails if one does not, because an unscoped view
lets Analyst read a stale run and report a number no widget can reproduce.

Views are Analyst's entire world. Give columns names that answer questions
directly, pre-compute the ratios you want presented, and normalise money to a
single currency in a `*_usd` column rather than making Analyst do it.

### 4. Add the scenario with its expected deltas

A scenario publishes what it will do before it does it: baseline metrics,
post-injection metrics, and the exact counts it will emit. Injection must be
atomic and idempotent per run.

Write the expected deltas as exact values, not ranges. Exactness is the point:
`verify` asserts them, the **What changed** panel shows measured against
published, and the audience sees a prediction confirmed rather than a claim.

### 5. Prove it offline

```bash
cd simulator
python -m fintech_demo preflight
python -m pytest tests -q
```

Add tests alongside the A2 ones: determinism, run id affecting identifiers only,
each segment hitting its documented rates, and the scenario emitting its
published counts. These run in milliseconds without a database, so they are where
metric bugs should be caught.

### 6. Seed, then verify against the workspace

```bash
python -m fintech_demo bootstrap
python -m fintech_demo verify --scenario <SCENARIO_ID> --inject
```

### 7. Write the Domain manifest

Copy `domains/a2-payment-pulse/manifest.yaml` and work through every field. The
manifest is the source of intent; Creator Mode is the deployed state.

Document every column the views select. `test_domain_manifest.py` fails if one is
missing, and an undocumented column is one Analyst will guess the meaning of.

State the things that are not obvious from a column name: which columns are
already ratios, that time is logical, which column to use for value, and the
guardrails on regulated decisions.

### 8. Add known questions and fixtures

Add the eight categories to `knownQuestions.ts` with ids and questions matching
the manifest exactly, then extend `scripts/build_fixtures.py`.

Build fixtures from the generator, not by hand. Hand-written fixtures drift from
the dashboard, and the moment an audience sees a stored answer disagree with the
widget beside it, the demo is over.

```bash
python scripts/build_fixtures.py
cd simulator && ../.venv/bin/python -m pytest tests/test_domain_manifest.py -q
```

That test asserts every known question and starter prompt resolves to a fixture
under the same matching rule the app uses, in both demo states.

### 9. Build the widgets

Add the anchor's SQL to `app/src/lib/metrics/<anchor>.ts`. Widget SQL is
deterministic and hand-written; it never comes from Analyst. It filters on the
active run and the logical clock exactly as the views do, so a paused stream
freezes the widgets too.

Reuse the existing components: `KpiTile`, the charts in `components/charts.tsx`,
`ScenarioPanel`, `WhatChanged`, `AnalystWorkspace`, and the `ui.tsx` primitives.
An anchor that looks different from A2 for no reason costs the audience attention
they should be spending on the story.

Provide the drill path all the way down. Aggregate, segment, single record. The
credibility of the whole demo rests on the audience being able to reach the row
behind the headline.

### 10. Register and validate

Add the anchor to `app/src/lib/anchors/index.ts` with its status, persona
framing, and scenario. It then appears on the launchpad automatically and
dispatches through the shared overview and evidence routes.

Build the Domain following
[`domain-setup-checklist.md`](domain-setup-checklist.md), run
`/admin/domain-check`, and record the result in `environment-manifest.yaml`.

## Checklist before calling it done

```bash
cd simulator && python -m fintech_demo preflight && ../.venv/bin/python -m pytest tests -q
python scripts/build_fixtures.py --check
npm --prefix app run lint && npm --prefix app run typecheck && npm --prefix app run build
npm --prefix app run scan:bundle
cd simulator && python -m fintech_demo verify --scenario <SCENARIO_ID> --inject
```

Then present it to yourself once, end to end, from the runbook. Most problems
worth fixing only show up when you have to say the numbers out loud.

## Current registry

`A1` through `A8` are complete reference implementations. A new anchor should
follow their registry-driven pattern: three curated active-run views, one
deterministic scenario, four KPIs plus a specialized visualization, a
record-level evidence route, reviewed Analyst fixtures, and a separate Domain.
