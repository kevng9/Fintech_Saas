# Fintech anchor catalog

Northstar is one modular fintech application with eight live business stories.
This catalog gives presenters a consistent talk track for every anchor.

## Delivery status

- **A1–A8** are available end to end: deterministic data, an atomic named
  scenario, business-specific widgets, Analyst investigation, and source-level
  evidence.
- Dashboard and fixture modes work without Aura. Live Analyst mode requires the
  corresponding separately scoped Domain and API key.

## The shared story pattern

Every anchor follows the same five-part narrative:

1. Establish normal performance against the business's own baseline.
2. Open that role's story. The page introduces one deterministic event and
   pauses the logical clock at the end of the window.
3. Read the decision card. The measured change matches the published contract.
4. Ask Aura Analyst the guided question for that same window.
5. Reach source-level evidence while a named human owner retains the decision.

## A1 — Digital Funnel Performance

**Audience:** Head of Digital Banking  
**Business question:** Where is account-opening conversion being lost, and
which intent cohort is affected?  
**Value:** Revenue growth and lower operating cost  
**Takeaway:** See intent earlier  
**Status:** Available end to end

**Scenario contract:** `A1_REVIEW_SPIKE` adds 100 starts, 80 submissions, 40
manual-review referrals, and 20 openings for one high-intent cohort. The
injected cohort has a 50% referral rate and 25% submit-to-open conversion.

**Suggested investigation:**

> Which intent cohort lost the most account openings, and at which journey
> stage?

**Why it matters:** The cohort submits at a healthy 80% rate, so demand is
not the problem. At the cohort's own baseline open rate of about 76%, its 80
applications would have opened about 60 accounts instead of 20, so roughly 40
openings were lost to review friction. Priced at each product's illustrative
first-year value (`dim_product.annual_value_usd`: Checking $300, Savings $150,
Credit Card $450, Personal Loan $800, Business Line $2,500), that is about
$28,000 of first-year revenue. The change card shows these figures for the
injected hour alone (40.5 openings, $28,368.60). Aura Analyst compares the
whole logical day with the prior days, so it includes the morning's sessions
and lands near 38 openings and $26,104. Both are correct for their period;
name the period if a customer asks why they differ.

**Evidence path:** Funnel → intent cohort → application journey → manual-review
timeline.

**Presenter close:**

> Northstar helps digital teams distinguish demand loss from review friction,
> so they can focus improvement work on the cohort and stage that changed.

## A2 — Payment Performance Management

**Audience:** Head of Payments  
**Business question:** Where did authorization performance or latency change?  
**Value:** Revenue, cost, and operational-risk protection  
**Takeaway:** Protect every payment  
**Status:** Available end to end

**Scenario contract:** `A2_PROCESSOR_TIMEOUT` creates a two-minute timeout burst
for Cardinal Rails / P2, Mastercard, and GB issuers. Approval falls from 96% to
88%, p95 latency rises from 180 ms to 680 ms, and timeout declines rise from 1%
to 7% on the affected lane.

**Suggested investigation:**

> For P2 / Mastercard / GB in the incident window, compare approval and p95
> latency with its prior seven-day baseline.

**Business-impact follow-up:** Point to the declined-value tile, then ask
Analyst to compare authorization rate by processor for the same window against
the prior seven days. Processor monitoring already alerts on a timeout burst;
the point to make here is how much approved value was lost and whether other
processors held up. Analyst answers that as analysis and does not reroute
traffic.

**Evidence path:** Incident card (88%, −8 points, 680 ms, 200 attempts) →
change impact → hour-wide lane context, which dilutes the burst and stays
still while the clock is paused → processor route → synthetic authorization.

**Human ownership:** Payment operations owns routing and processor decisions.

**Presenter close:**

> Northstar moves the team from a diluted portfolio signal to the exact route
> and authorizations that deserve attention.

Use [`demo-script.md`](demo-script.md) for the complete presenter-ready A2
walkthrough.

## A3 — Fraud Strategy Optimization

**Audience:** VP of Fraud Strategy  
**Business question:** Which segments explain confirmed fraud loss and false
positives?  
**Value:** Risk reduction, lower review cost, and legitimate-revenue protection  
**Takeaway:** Trace loss faster  
**Status:** Available end to end

**Scenario contract:** `A3_LOSS_CLUSTER` adds 100 transactions and 12 alerts.
Human fixtures close five as fraud and seven as legitimate. Investigator-confirmed
loss rises by $2,500 and the injected cohort's false-positive rate is 58.33%.
Present the false-positive rate as a jump against the segment's own baseline,
not as an absolute alarm level.

**Planted pattern:** All 12 injected alerts are card testing on
card-not-present. The five confirmed-fraud cases share one device and carry the
`velocity_breach` and `cvv_retry` reason codes. The seven false positives each
use a different device and were flagged on `geo_anomaly` alone. Before
injection, ATM first-party fraud leads confirmed loss at $1,519.75. After it,
card testing on card-not-present leads at $2,500, so re-asking the same
question gives a different answer. The reason codes are a JSON array in
`aa_fraud_segment_evidence.reason_codes`, so the generated SQL reads JSON,
joins five tables, and aggregates in one statement.

**Suggested investigation:**

> Which channel and fraud type explain the increase in investigator-confirmed
> loss, and how does that segment's false-positive rate compare with its
> baseline?

**Framing note:** The dashboard shows loss confirmed by investigators at case
disposition. Chargeback-settled loss arrives 30 to 90 days later and is not in
this demo. Open at the segment level, which is the strategy view, before
drilling into individual cases, which is the investigator view.

**Evidence path:** Loss trend → ranked segment → fraud case → transactions,
devices, evidence, and human disposition.

**Human ownership:** Investigators retain case decisions and customer actions.
An alert or score alone is never presented as confirmed fraud.

**Presenter close:**

> Northstar connects portfolio loss to human-reviewed cases without turning a
> model score into an automated accusation.

## A4 — Financial Crime Operations

**Audience:** Head of AML Operations  
**Business question:** Which alert cohorts need attention, and what evidence is
available?  
**Value:** Regulatory-risk control and lower investigation cost  
**Takeaway:** Assemble evidence faster  
**Status:** Available end to end

**Scenario contract:** `A4_CORRESPONDENT_SPIKE` adds 25 linked transactions and
one high-priority alert. Open backlog, high-priority count, and SLA-risk count
each rise by one; available evidence rises by 25 records.

**Suggested investigation:**

> Which rules and risk bands carry the most open backlog and SLA risk, and for
> the alert that breaches first, what linked activity supports it and where
> are the evidence gaps?

**Framing note:** Open with the backlog by rule, risk band, and queue, which
is the operations-head view, and then drill into the alert. Rule productivity
(alert-to-SAR conversion) is the next question this audience asks. Disposition
outcomes by rule are not in this demo's data.

**Evidence path:** Backlog → SLA-risk cohort → alert → entities, counterparties,
linked transactions, evidence completeness, and prior cases.

**Human ownership:** AML investigators retain alert disposition and regulatory
filing decisions. The application does not predict a disposition.

**Presenter close:**

> Northstar assembles the activity and evidence around the alert while policy
> decisions remain with the investigator.

## A5 — Dispute Operations Performance

**Audience:** VP of Disputes Operations  
**Business question:** Which queues will breach SLA, and what explains the
pressure?  
**Value:** Lower cost, lower risk, and stronger customer retention  
**Takeaway:** Resolve cases earlier  
**Status:** Available end to end

**Scenario contract:** `A5_CASE_SURGE` models a merchant terminal outage a
week ago: card payments appeared to fail, customers paid again by other means,
and both charges posted. It adds 20 `PAID_BY_OTHER_MEANS` disputes in
`queue_disputes_escalated` in two waves. Twelve were filed right after the
outage and reach the issuer's five-business-day provisional-credit target
(stricter than the Regulation E ten-business-day limit) within the next 24
logical hours. Eight more arrive now and are due in a week. Every disputed
payment was made at one in-store merchant (Copperfield Electronics Retail)
during a 12-minute window, so the dispute views show the wave concentrating on
that merchant. Queue depth rises by 20 and SLA-risk count rises by 12.

**Suggested investigation:**

> Which reason code and merchant are driving the largest at-risk queue, and
> when did those disputes arrive?

**Why it matters:** The wave built quietly over a week. Without the arrival
pattern, the team would see 12 deadlines land tomorrow with no warning. Seeing
that all 20 trace to one merchant turns 20 separate cases into one incident to
work with that merchant.

**Evidence path:** Queue health → SLA-risk cohort → dispute case → transaction,
contacts, credit, status, and event timeline.

**Human ownership:** Authorized agents retain adjudication and provisional
credit decisions.

**Presenter close:**

> Northstar shows where service pressure is forming and why, helping operations
> prioritize work before cases breach SLA.

## A6 — Liquidity and Funding Management

**Audience:** Corporate Treasurer  
**Business question:** Where is near-term funding pressure forming?  
**Value:** Lower funding cost and reduced settlement risk  
**Takeaway:** See funding pressure  
**Status:** Available end to end

**Scenario contract:** `A6_SETTLEMENT_DELAY` delays a synthetic USD 25 million
inbound settlement. The operating tile shows available 24-hour liquidity after
that delay, about USD 52.2 million, against about USD 77.2 million before it.
Settlement-at-risk rises by USD 25 million, and the liquidity impact is
−USD 25 million. Against an illustrative USD 60 million policy buffer, the
group moves from about USD 17.2 million of headroom to a shortfall of about
USD 7.8 million.

**Suggested investigation:**

> Are we above the policy liquidity buffer, and which entity and currency
> explain any shortfall?

**Follow-up:** Open Synthetic Entity 01 to show the delayed USD inbound
settlement and the queued payments in the next funding window.

**Evidence path:** Group liquidity → entity and currency variance → funding
window → positions, settlements, queued payments, and forecast drivers.

**Human ownership:** Treasury retains funding, release, and transfer decisions.

**Presenter close:**

> Northstar traces a group-level liquidity movement to the settlement and
> funding window behind it without initiating a transfer.

## A7 — Credit and Exposure Management

**Audience:** Chief Credit Officer  
**Business question:** What evidence and portfolio concentration should a
reviewer consider?  
**Value:** Balanced revenue growth, operating cost, and concentration risk  
**Takeaway:** Context before decision  
**Status:** Available end to end

**Scenario contract:** `A7_PENDING_EXPOSURE` adds a pending USD 5 million
Transportation application in California with two evidence exceptions. Pending
amount rises by USD 5 million; illustrative pro forma concentration moves from
20.00% to 23.81%, which leaves 1.19 points of headroom against an illustrative
25% segment limit (down from 5.00 points); booked exposure does not change.

**Suggested investigation:**

> If pending applications book, how much headroom remains against the 25%
> segment concentration limit?

**Follow-up:** Open the pending application from **Recent applications** and
ask which evidence is verified and which exceptions the reviewer should
examine. The portfolio question is the Chief Credit Officer's; the evidence
review belongs to the credit officer.

**Evidence path:** Pending pipeline → pro forma concentration → **Recent
applications** list → application evidence, provenance, exceptions, and current
booked exposure.

**Human ownership:** Credit officers retain approval, decline, pricing, and
adverse-action decisions. Pro forma concentration must be labeled illustrative.

**Presenter close:**

> Northstar gives the reviewer portfolio context and traceable evidence without
> making or recommending a regulated credit decision.

## A8 — Embedded Insights Strategy

**Audience:** Chief Product Officer  
**Business question:** How can a customer receive a useful, scoped explanation
inside the product?  
**Value:** Engagement, monetization, and support deflection  
**Takeaway:** Explain, engage, monetize  
**Status:** Available end to end

**Scenario contract:** `A8_DINING_SPIKE` adds three dining transactions totaling
$300. Dining spend rises by $300, net cash flow falls by $300, and the decision
explains three transactions. The proof is a reusable self-service explanation,
not the $300 itself. Product teams own customer messaging and any offer.

**Suggested customer question:**

> Why is my spending higher this month, and which transactions explain the
> change?

**Evidence path:** Customer money summary → category change → three supporting
synthetic transactions.

**Scope boundary:** The embedded experience is restricted to one synthetic
customer and contains no presenter controls or cross-customer access.

**Judgment questions:** When the customer asks "Am I spending too much?",
Analyst compares this month with the customer's own history and names the
category that changed most, without giving advice. An outright refusal would
end the conversation; a comparison keeps the customer engaged.

**Presenter close:**

> Northstar turns a customer's own activity into a concise, transaction-backed
> explanation that product teams can reuse. Aura explains the activity; product
> owns the message.

## Portfolio close

> The eight anchors serve different business owners, but the proof pattern is
> the same: establish a trusted baseline, detect a controlled change, use
> governed natural-language analysis to assemble evidence, and keep the
> consequential decision with the responsible person.

When the buyer equates Aura with a generic LLM, or when a CFO asks about AI
platform spend, add proof modules **P9** and **P10** from
[`proof-modules.md`](proof-modules.md) (in-app: `/value`).

