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
2. Introduce one deterministic, named business event.
3. Detect the changed KPI and rank the affected cohort.
4. Ask Aura Analyst to assemble the measured evidence from curated views.
5. Reach source-level evidence while a named human owner retains the decision.

## A1 — Digital Journey Intelligence

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

> Which high-intent cohort experienced the largest conversion change, and at
> which journey stage did the change occur?

**Evidence path:** Funnel → intent cohort → application journey → manual-review
timeline.

**Presenter close:**

> Northstar helps digital teams distinguish demand loss from review friction,
> so they can focus improvement work on the cohort and stage that changed.

## A2 — Payment Pulse

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

> During the weakest window, rank processors and rails against the prior
> seven-day baseline.

**Evidence path:** Portfolio signal → lane movement → before-and-during impact →
processor route → synthetic authorization.

**Human ownership:** Payment operations owns routing and processor decisions.

**Presenter close:**

> Northstar moves the team from a diluted portfolio signal to the exact route
> and authorizations that deserve attention.

Use [`demo-script.md`](demo-script.md) for the complete presenter-ready A2
walkthrough.

## A3 — Trace the Loss

**Audience:** VP of Fraud Strategy  
**Business question:** Which segments explain confirmed fraud loss and false
positives?  
**Value:** Risk reduction, lower review cost, and legitimate-revenue protection  
**Takeaway:** Trace loss faster  
**Status:** Available end to end

**Scenario contract:** `A3_LOSS_CLUSTER` adds 100 transactions and 12 alerts.
Human fixtures close five as fraud and seven as legitimate. Confirmed loss rises
by $2,500 and the injected cohort's false-positive rate is 58.33%.

**Suggested investigation:**

> Which segment explains the increase in human-confirmed loss, and how does its
> false-positive rate compare with the baseline?

**Evidence path:** Loss trend → ranked segment → fraud case → transactions,
devices, evidence, and human disposition.

**Human ownership:** Investigators retain case decisions and customer actions.
An alert or score alone is never presented as confirmed fraud.

**Presenter close:**

> Northstar connects portfolio loss to human-reviewed cases without turning a
> model score into an automated accusation.

## A4 — Alert-to-Evidence

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

> Which alert moved into SLA risk, what linked activity supports it, and where
> are the evidence gaps?

**Evidence path:** Backlog → SLA-risk cohort → alert → entities, counterparties,
linked transactions, evidence completeness, and prior cases.

**Human ownership:** AML investigators retain alert disposition and regulatory
filing decisions. The application does not predict a disposition.

**Presenter close:**

> Northstar assembles the activity and evidence around the alert while policy
> decisions remain with the investigator.

## A5 — Dispute Resolution Lens

**Audience:** VP of Disputes Operations  
**Business question:** Which queues will breach SLA, and what explains the
pressure?  
**Value:** Lower cost, lower risk, and stronger customer retention  
**Takeaway:** Resolve cases earlier  
**Status:** Available end to end

**Scenario contract:** `A5_CASE_SURGE` adds 20 disputes tagged
`MERCHANT_OUTAGE`, including 12 due within 60 minutes. Queue depth rises by 20
and SLA-risk count rises by 12.

**Suggested investigation:**

> Which queue has the largest increase in near-term SLA risk, and which reason
> code is driving it?

**Evidence path:** Queue health → SLA-risk cohort → dispute case → transaction,
contacts, credit, status, and event timeline.

**Human ownership:** Authorized agents retain adjudication and provisional
credit decisions.

**Presenter close:**

> Northstar shows where service pressure is forming and why, helping operations
> prioritize work before cases breach SLA.

## A6 — Liquidity Command Center

**Audience:** Corporate Treasurer  
**Business question:** Where is near-term funding pressure forming?  
**Value:** Lower funding cost and reduced settlement risk  
**Takeaway:** See funding pressure  
**Status:** Available end to end

**Scenario contract:** `A6_SETTLEMENT_DELAY` delays a synthetic USD 25 million
inbound settlement. Projected 24-hour liquidity falls by USD 25 million and
settlement-at-risk rises by the same amount.

**Suggested investigation:**

> Which entity and currency explain the largest change in the 24-hour funding
> position, and which settlement created the variance?

**Evidence path:** Group liquidity → entity and currency variance → funding
window → positions, settlements, queued payments, and forecast drivers.

**Human ownership:** Treasury retains funding, release, and transfer decisions.

**Presenter close:**

> Northstar traces a group-level liquidity movement to the settlement and
> funding window behind it without initiating a transfer.

## A7 — Credit Risk Pulse

**Audience:** Chief Credit Officer  
**Business question:** What evidence and portfolio concentration should a
reviewer consider?  
**Value:** Balanced revenue growth, operating cost, and concentration risk  
**Takeaway:** Context before decision  
**Status:** Available end to end

**Scenario contract:** `A7_PENDING_EXPOSURE` adds a pending USD 5 million
Transportation application in California with two evidence exceptions. Pending
amount rises by USD 5 million; illustrative pro forma concentration moves from
20.00% to 23.81%; booked exposure does not change.

**Suggested investigation:**

> How would the pending request change concentration, and which verified
> evidence or exceptions should the reviewer examine?

**Evidence path:** Pending pipeline → pro forma concentration → **Recent
applications** list → application evidence, provenance, exceptions, and current
booked exposure.

**Human ownership:** Credit officers retain approval, decline, pricing, and
adverse-action decisions. Pro forma concentration must be labeled illustrative.

**Presenter close:**

> Northstar gives the reviewer portfolio context and traceable evidence without
> making or recommending a regulated credit decision.

## A8 — Explain My Money

**Audience:** Chief Product Officer  
**Business question:** How can a customer receive a useful, scoped explanation
inside the product?  
**Value:** Engagement, monetization, and support deflection  
**Takeaway:** Explain, engage, monetize  
**Status:** Available end to end

**Scenario contract:** `A8_DINING_SPIKE` adds three dining transactions totaling
$300. Dining spend and outflows rise by $300, and net cash flow falls by $300.

**Suggested customer question:**

> Why is my spending higher this month, and which transactions explain the
> change?

**Evidence path:** Customer money summary → category change → three supporting
synthetic transactions.

**Scope boundary:** The embedded experience is restricted to one synthetic
customer and contains no presenter controls or cross-customer access.

**Presenter close:**

> Northstar turns a category movement into a concise, transaction-backed
> explanation inside the customer experience.

## Portfolio close

> The eight anchors serve different business owners, but the proof pattern is
> the same: establish a trusted baseline, detect a controlled change, use
> governed natural-language analysis to assemble evidence, and keep the
> consequential decision with the responsible person.

