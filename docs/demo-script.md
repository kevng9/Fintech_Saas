# Northstar Payment Intelligence demo script

A presenter-ready, 10-minute story for a Head of Payments or Payment Operations
audience. The script follows Tell-Show-Tell: establish the business problem,
show the investigation, then close on the business outcome.

This script demonstrates **A2 Payment Performance Management** in depth. All eight anchors are
available end to end; use the [`fintech anchor catalog`](anchor-catalog.md) for
each anchor's business contract, deterministic scenario, evidence path, and
talk track.

## The one sentence to remember

> Northstar helps payment teams move from a portfolio signal to the exact
> processor, route, and authorization events that deserve attention.

## Optional 90-second portfolio introduction

Use this before the timed A2 story when the audience needs to understand the
broader platform:

> Northstar is one modular intelligence experience for eight fintech business
> workflows. Digital banking can find conversion friction. Payments can isolate
> authorization changes. Fraud and AML teams can assemble human-reviewed
> evidence. Disputes can anticipate SLA pressure. Treasury can trace funding
> gaps. Credit can assess evidence and illustrative concentration. Product
> teams can explain a customer's money movement from supporting transactions.
>
> Each story uses the same proof pattern: start from the business's own
> baseline, introduce or detect a measurable change, investigate it through
> governed views, and reach the supporting evidence. Regulated or financial
> actions remain with the responsible person.
>
> Today I will show that pattern in depth through Payment Performance Management. The same
> baseline-to-evidence workflow is live across the other seven anchors.

## Before the audience joins

1. Start the simulator and app:

   ```bash
   # terminal 1, from the repository root
   cd simulator && python -m fintech_demo run

   # terminal 2, from the repository root
   cd app && npm run dev
   ```

2. Open `/admin` and confirm the database, active run, baseline checksum, and
   stream checks are green. The customer demo uses live Aura
   (`ANALYST_MODE=live`).
3. Run the known questions at `/admin/domain-check`.
4. Reset the environment, then resume the stream. A reset leaves the clock
   paused. Resume once so the baseline is live, then press **Esc** to return
   to the customer view.
5. Open **Overview**. Confirm **Operating normally**, approval near 95.9%, and
   no incident badge.

Do not open the incident before the presentation.

---

## 0:00–0:45 — Open with the business problem

**Screen:** Overview

**Say:**

> Payment economics can move long before a batch report reaches the operations
> team. A small drop in approvals or a rise in latency can affect revenue and
> customer experience while the portfolio-level number still looks healthy.
>
> I’m going to show how a payments leader can spot that movement, isolate the
> affected route, explain the decline pattern, and reach the underlying payment
> evidence in a few minutes.

**Point to:**

- **Authorization network** and **Operating normally**
- The seven-day operating baseline
- **See a revenue-risk incident**

**Transition:**

> Let’s start with normal operations so the change is obvious when it happens.

---

## 0:45–2:00 — Establish the healthy baseline

**Action:** Open **Payment Performance Management** from the header. Do not start the incident yet.

**Screen:** Payment Performance Management, one-hour range

**Say:**

> This is the operating view for authorization health. It combines the signals a
> payment team watches every day: approval rate, p95 latency, timeout share, and
> declined value.
>
> Right now the network is behaving normally. Approval rate is about 95.9
> percent, p95 latency is about 229 milliseconds, and timeout declines are near
> one percent. Each signal is compared with its own seven-day baseline, so
> “healthy” means normal for this business, not a generic industry threshold.

**Point to:**

- **Authorization rate:** approximately `95.9%`
- **p95 authorization latency:** approximately `229 ms`
- **Timeout declines:** approximately `1.0%`
- The flat authorization-performance trend
- The small route movements, all within a fraction of a point

**Do not say:** that the system has diagnosed a cause. At this point it has only
measured normal behavior.

**Transition:**

> Now let’s introduce the kind of processor issue that is easy to miss in an
> aggregate portfolio view.

---

## 2:00–3:00 — Reveal the processor incident

**Action:** Return to **Overview** and choose **See a revenue-risk incident**,
or choose **Reveal the incident** on Payment Performance Management.

**Say before the page finishes:**

> This introduces a two-minute timeout burst on one route: Cardinal Rails,
> Mastercard, and UK issuers.
>
> We know the expected operating signature before it appears: approval rate on
> that route falls from 96 to 88 percent, timeout share rises from one to seven
> percent, and p95 latency rises from 180 to 680 milliseconds.

**Say while the page loads:**

> The event is written as one complete change, and the logical clock pauses at
> the end of that window. The incident card, the hour-wide context, and Aura
> then inspect the same moment.

**Expected result:**

- The decision card reads **Revenue-risk incident detected**
- P2 / Mastercard / GB shows 88% approval, −8 points, 680 ms, and 200 attempts
- **Change impact** confirms 96% → 88%, 1% → 7%, and 180 ms → 680 ms

**Transition:**

> The portfolio signal tells us something moved. The next question is where.

---

## 3:00–4:30 — Read the incident, then the network context

**Action:** Stay on the incident card. Then point to **Lane movement**.

**Say:**

> The decision is the two-minute window on Cardinal Rails, Mastercard, and GB
> issuers. The hour-wide network moves only modestly because that burst is
> diluted across every other route and the rest of the hour.
>
> The lane chart is context. It stays where it is because the clock is paused.
> The incident card is the number an operator acts on.

**Action:** Point to **Change impact**.

**Say:**

> Here is the same route before and during the event. Approval falls to 88
> percent, timeout share reaches seven percent, and p95 latency reaches 680
> milliseconds. The observed impact matches the expected operating signature.

**Business takeaway:**

> We have narrowed a portfolio-level movement to one processor, network, and
> issuer market without waiting for an analyst queue.

---

## 4:30–7:00 — Investigate in natural language

**Action:** Scroll to **Ask about Payment Performance Management**.

### Question 1: Confirm the incident window

**Ask:**

> For P2 / Mastercard / GB in the incident window, compare approval and p95
> latency with its prior seven-day baseline.

**Say before you ask, so the room hears why the chat is here:**

> The tiles are the operating picture. They show that something moved. This
> chat is how you investigate a question those tiles were not built to answer:
> a processor comparison, a decline mix, or that same mix for Mastercard only.
> Aura Analyst turns the question into SQL over curated, read-only payment
> views, runs it on SingleStore, and leaves the SQL available to check. A
> follow-up keeps the window you already set. Analyst assembles the evidence.
> Payment operations still owns the routing decision.

**Expected answer:** One row for P2 / Mastercard / GB. Incident attempts are
200, approval is 88 percent, and p95 latency is 680 milliseconds. The prior
seven-day baseline is about 96 percent and 180 milliseconds. The answer uses
the paused incident window, not a later hour.

### Question 2: Explain the decline mix

**Ask:**

> For the largest change, break declines down by merchant category and response
> code.

**Expected answer:** `TIMEOUT` becomes the dominant change, concentrated in
Digital Goods for the affected route.

**Say:**

> Analyst has not declared a root cause. It has assembled the measured pattern:
> where the change occurred, which response code expanded, and which merchant
> segment carries the concentration. Payment operations still owns the routing
> or processor decision.

### Optional 90-second insert — Why Aura is not a generic LLM (P9)

Use after Question 1 when the room may confuse Aura with “ChatGPT on our data.”

**Screen:** Analyst answer with SQL open, or `/value#why-aura`

**Say:**

> Connecting a language model to warehouse tables is easy to claim. What you
> just saw is different: the question ran against a governed Domain, the SQL
> executed on SingleStore’s live foundation, and the evidence stays
> inspectable. Aura assembles the pattern; your operators still own the action.

Full talk track: [`proof-modules.md`](proof-modules.md) and in-app `/value`.

### Optional CFO / FP&A insert — AI Platform Economics (P10)

If a finance or platform-economics buyer is present, open `/value#ai-cost` or
**Platform** and contrast one-engine architecture with
operational-store → ETL → warehouse → LLM agent spend. Do not invent vendor
invoices; ask for their AI and warehouse baseline as the stage gate.

### Optional trust proof for a technical audience

**Action:** Open **Show generated SQL** on one answer.

**Say:**

> The answer is inspectable. The generated SQL reads only the Domain’s curated
> views, which are scoped to the active business run and attached read-only.

Skip this step for an executive audience.

---

## 7:00–8:30 — Move from aggregate to evidence

**Action:** In **Payment routes**, open **Cardinal Rails** for the affected
Mastercard / GB route.

**Say:**

> We can continue from the aggregate into the route itself. The route view keeps
> the same baseline comparison, shows the hourly shape, and lists the individual
> synthetic authorizations behind the metric.

**Action:** Enable **Scenario events only**, then open one timeout payment.

**Say:**

> This authorization is one of the rows that produced the aggregate. We can see
> its processor, network, issuer market, response code, amount, and latency.
>
> There is no gap between the executive signal and the evidence an operator
> needs for follow-up.

**Point to:**

- Response code `TIMEOUT`
- Latency `680 ms`
- Processor `P2 / Cardinal Rails`
- Mastercard and GB issuer context

---

## 8:30–9:30 — Explain what is native and what is application UX

**Say:**

> There are two layers here. SingleStore provides the live data foundation and
> Aura Analyst provides Domain-grounded natural-language analysis, generated
> SQL, execution, and streamed results.
>
> Northstar is the application experience around those capabilities: the
> payment-health dashboard, operating drill, route navigation, and evidence
> views. That separation lets a team embed governed analysis inside the workflow
> its users already understand.

If the audience is nontechnical, shorten this to:

> The dashboard and the conversational investigation use the same governed
> payment data, so users do not have to reconcile two versions of the truth.

---

## 9:30–10:00 — Close and ask for the next step

**Action:** Return to Payment Performance Management. Do not reset until after the closing
question; leave the business impact visible.

**Say:**

> We started with a small movement in portfolio health. We isolated it to one
> payment route, explained the decline pattern, and reached the individual
> authorizations behind it.
>
> The outcome is not automated payment routing. The outcome is faster,
> evidence-backed investigation, with the payment team retaining the decision.
>
> **Protect approvals. Investigate in minutes, not hours.**

**Stage-gate question:**

> Which payment-performance question currently takes your team the longest to
> answer, and what data would we need to validate that workflow with your
> baseline?

Pause. Do not fill the silence.

---

## Five-minute version

Use this when time is tight:

1. **0:00–0:45:** State the delayed-visibility problem.
2. **0:45–1:30:** Show the healthy Payment Performance Management baseline.
3. **1:30–2:00:** Choose **See a revenue-risk incident**. The clock pauses.
4. **2:00–3:00:** Read the incident card and **Change impact**.
5. **3:00–4:15:** Ask the incident-window question:

   > For P2 / Mastercard / GB in the incident window, compare approval and p95
   > latency with its prior seven-day baseline.

6. **4:15–5:00:** Close with **Protect approvals** and ask the stage-gate
   question.

Skip the payment-level drill-down and generated SQL.

## If live Analyst fails

1. Keep speaking. Say:

   > The operating decision is already on the incident card. Aura is the
   > investigation path, and the card remains the evidence if that path is slow.

2. Stay on the incident card and **Change impact**.
3. Do not switch the room to a stored answer. This demo is configured for live
   Aura, and the customer view does not substitute a fixture.
4. Do not apologize repeatedly or troubleshoot on screen.

## Presenter guardrails

- Say **measured pattern**, not **root cause**, unless a human has confirmed it.
- Say **supports a routing decision**, not **reroutes payments**.
- Say **synthetic authorization**, never imply the rows belong to real customers.
- Describe approval or revenue improvement as a hypothesis until validated
  against customer data.
- For live Analyst, disclose that Aura Analyst and its API are Preview features.
- Keep architecture and SQL out of the main story unless the audience asks for
  trust, governance, or implementation detail.

## After the meeting

Reset the environment so the next session opens on a clean baseline:

```bash
cd simulator
python -m fintech_demo reset
```

If anything behaved unexpectedly, capture `/admin/data` and the simulator output
before resetting.
