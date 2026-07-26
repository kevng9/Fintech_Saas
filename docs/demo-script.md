# Northstar Payment Intelligence demo script

A presenter-ready, 10-minute story for a Head of Payments or Payment Operations
audience. The script follows Tell-Show-Tell: establish the business problem,
show the investigation, then close on the business outcome.

This script demonstrates **A2 Payment Pulse** in depth. All eight anchors are
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
> Today I will show that pattern in depth through Payment Pulse. The same
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
   stream checks are green.
3. If you will use live Aura Analyst, run all questions at
   `/admin/domain-check`. Otherwise, open **Demo controls** and select
   **Analyst → Fixture**.
4. Select **Audience → Business**.
5. Reset the environment to its baseline.
6. Open **Overview** and collapse **Demo controls**.
7. Confirm the overview shows approximately `322,000` authorizations and
   **Normal operations**.

Do not start the operational drill before the presentation.

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

- The live authorization network
- The seven-day operating baseline
- **Today’s focus → Payment Pulse**

**Transition:**

> Let’s start with normal operations so the change is obvious when it happens.

---

## 0:45–2:00 — Establish the healthy baseline

**Action:** Click **Open payment operations**.

**Screen:** Payment Pulse, one-hour range

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

## 2:00–3:00 — Start the processor disruption

**Action:** Scroll to **Run an operational drill**.

**Say before clicking:**

> This drill introduces a two-minute timeout burst on one route: Cardinal Rails,
> Mastercard, and UK issuers.
>
> We know the expected operating signature before we start: approval rate on
> that route falls from 96 to 88 percent, timeout share rises from one to seven
> percent, and p95 latency rises from 180 to 680 milliseconds.

**Action:** Click **Start drill**.

**Say while the page refreshes:**

> The event is written atomically, so the team never sees a half-loaded incident.
> The dashboard moves from the complete baseline to the complete disruption.

**Expected result:**

- The page status changes to **Operational change detected**
- The affected route becomes the largest negative lane movement
- **Change impact** displays a before-and-during comparison

**Transition:**

> The portfolio signal tells us something moved. The next question is where.

---

## 3:00–4:30 — Isolate the affected route

**Action:** Return to **Key operating signals** and **Lane movement**.

**Say:**

> The overall approval rate moves only modestly because one route is diluted
> across the full network. But when we compare each route with its own baseline,
> Cardinal Rails, Mastercard, and GB issuers separates immediately.
>
> This is the difference between seeing that the portfolio moved and knowing
> where an operator should investigate.

**Action:** Point to the affected route, then the **Change impact** card.

**Say:**

> Here is the same route before and during the event. Approval falls to exactly
> 88 percent, timeout share reaches seven percent, and p95 latency reaches 680
> milliseconds. The observed impact matches the expected operating signature.

**Business takeaway:**

> We have narrowed a portfolio-level movement to one processor, network, and
> issuer market without waiting for an analyst queue.

---

## 4:30–7:00 — Investigate in natural language

**Action:** Scroll to **Ask your payment data**.

### Question 1: Find the driver

**Ask:**

> During the weakest window, rank processors and rails against the prior
> seven-day baseline.

**Say while the answer streams:**

> Aura Analyst is translating the business question into SQL over curated,
> read-only payment views. The dashboard metrics remain deterministic; Analyst
> adds a conversational investigation path over the same governed data.

**Expected answer:** Cardinal Rails / P2 and the affected Mastercard route rank
as the largest deterioration.

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

**Action:** Return to Payment Pulse. Do not reset until after the closing
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
2. **0:45–1:30:** Show the healthy Payment Pulse baseline.
3. **1:30–2:00:** Start the processor timeout drill.
4. **2:00–3:00:** Show the affected route and Change impact.
5. **3:00–4:15:** Ask one Analyst question:

   > For the largest change, break declines down by processor, merchant category,
   > and response code.

6. **4:15–5:00:** Close with **Protect approvals** and ask the stage-gate
   question.

Skip the payment-level drill-down and generated SQL.

## If live Analyst fails

1. Keep speaking. Say:

   > The operational dashboard is live and independent of the conversational
   > layer. I’m switching to a reviewed response so we can continue the business
   > story.

2. Open **Demo controls**.
3. Select **Analyst → Fixture**.
4. Ask one of the displayed starter questions.
5. Do not apologize repeatedly or troubleshoot on screen.

The UI labels stored responses, so the fallback is visible rather than hidden.

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
