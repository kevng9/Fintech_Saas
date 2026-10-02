# Aura Domain setup checklist: A1–A8

Public APIs for managing Domain context are not documented, so each Domain is
built in Creator Mode. This checklist is the procedure and the matching
`domains/<anchor>/manifest.yaml` is the source of intent. Work from the
manifest; do not improvise wording, because the recorded expectations in each
known-question suite assume it. Repeat the checklist once for every anchor.

Do this once per environment, and again whenever the manifest's
`context_version` changes.

## Before you start

- `python -m fintech_demo bootstrap` has completed, so the views exist and have
  data. A Domain built against empty views produces poor context.
- The Aura Analyst workspace is attached to `fintech_demo` **read-only**.

## 1. Create the Domain

In the SingleStore Cloud Portal, create a Domain using the selected manifest:

| Field | Value |
| --- | --- |
| Name | the manifest's `domain_name` |
| Database | the manifest's `database` (`fintech_demo`) |
| Workspace | the read-only Aura workspace |
| Description | the manifest's `description` block |

## 2. Add exactly the manifest's three views

Add only the three curated views listed in the manifest. Nothing else. For A2,
for example:

- `aa_payment_performance_hourly`
- `aa_payment_decline_mix`
- `aa_payment_event_sample`

Do not add a base table and do not add a control table. Every one of these views
already filters to the active run and the logical clock; a base table does not,
so adding one would let Analyst read another run's rows and report numbers that
no widget can reproduce.

Verify after adding: the Domain's table list has three entries, all prefixed
`aa_`.

## 3. Paste the descriptions

For each view, copy its `description` and then each column's description from
the manifest, verbatim.

The column descriptions are doing real work, so resist shortening them:

- They state that `approval_rate` and the share columns are **already ratios**
  between 0 and 1. Without this, answers come back at 9590%.
- They state that `hour_start` and `event_time` are **logical** demo time.
  Without this, Analyst reaches for `NOW()` and finds nothing.
- They point value questions at the `*_usd` columns. Attempts settle in four
  currencies, so summing `amount` across lanes produces a meaningless total.

## 4. Add the relationships

Add both relationships from the manifest's `relationships` block, with their
join keys and notes. These are what let a question about hourly performance drill
into the decline mix without the user naming a join.

## 5. Paste the instructions

Copy the manifest's `instructions` block into the Domain's instruction field,
verbatim and complete.

Two groups of lines in it are not stylistic. The presentation rules keep ratios
and milliseconds readable. The guardrails keep Analyst out of regulated
decisions: it must not approve, decline, block, route, file, release, price,
adjudicate, or contact a customer, and it must not recommend routing or contract
changes. Trimming these changes what the demo demonstrates.

For A7 (and any Domain after a `context_version` bump), also keep the
SingleStore SQL constraints: Analyst must not emit `GROUP_CONCAT` or mix
`DISTINCT` aggregates with `ORDER BY` (error 1706). Evidence questions must use
detail-row `SELECT`s.

## 6. Add the starter prompts

Add the three `starter_prompts` from the manifest. These appear as conversation
starters in the Analyst workspace and are the ones the presenter clicks, so they
must exist as written.

## 7. Create a Domain-scoped API key

Create an API key scoped to **this Domain only**, then put it in
`app/.env.local` using the manifest's `key_secret` name
(`ANALYST_A1_API_KEY` through `ANALYST_A8_API_KEY`).

A key with broader scope would let a bug in one anchor read another anchor's
data. One key per Domain is the whole point.

Also set `ANALYST_ORG_ID`, `ANALYST_PROJECT_ID`, and `ANALYST_REGION` if you have
not already. The manifest's `endpoint_secret` (`ANALYST_A1_ENDPOINT` through
`ANALYST_A8_ENDPOINT`) overrides the derived Analyst **base** URL (`…/analyst`)
when needed. Do not paste a `/chat` URL — the app appends `/chat`, `/query`, and
`/conversation-starters` itself.

## 8. Validate

Restart the app so it picks up the key, set the Analyst selector to **Live**,
then open `/admin/domain-check` and run all questions.

The suite has eight questions covering single-table, multi-table, comparison,
session follow-up, ambiguous term, unsupported action, no data, and invalid
filter. Automatic checks confirm the mechanics: rows came back, SQL was
generated, a refusal was actually a refusal. **You** confirm the substance
against each question's recorded expectation, and mark it correct or incorrect.

Every question must be correct before the Domain is considered validated. The
last four matter most, because they are where a poorly contextualized Domain
invents an answer:

- The ambiguous question must ask what you mean, or state the measure it chose.
- The unsupported action must be refused without claiming to have acted.
- The no-data filter must return an empty result stated plainly, not a
  substituted country.
- The invalid filter must produce an error or a clarification, never fabricated
  rows.

## 9. Record what you published

Update `environment-manifest.yaml`:

- `anchors[aN].domain_built: true`
- `anchors[aN].domain_key_configured: true`
- `anchors[aN].context_version` to the manifest's `context_version`
- `anchors[aN].known_questions_passed_at` to today

Also set `validated_at` in the manifest itself. This is the only durable record
that the Domain a given environment is running was reviewed, because the portal
does not version context.

## If answers are wrong

| Symptom | Likely cause |
| --- | --- |
| Percentages 100× too large | The "already a ratio" column descriptions were shortened |
| "No data" for recent periods | Logical-time wording missing; Analyst used `NOW()` |
| Totals that match no widget | Value summed on `amount` instead of `amount_usd` |
| Answers name a cause confidently | The correlation-is-not-causation instruction was dropped |
| A routing recommendation | The guardrail lines were trimmed |
| Cannot join two views | The `relationships` block was not added |

Fix the context, bump `context_version`, and re-run the whole suite. Do not
re-run only the question that failed: context changes are global, so a fix in one
place can regress an answer somewhere else.
