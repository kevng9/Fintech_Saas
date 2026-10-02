# Runbook

How to operate the demo before, during, and after a presentation. For exact
speaker notes and timing, use the
[`10-minute presenter script`](demo-script.md). For the persona, decision,
scenario contract, evidence path, and talk track for A1 through A8, use the
[`fintech anchor catalog`](anchor-catalog.md). For Aura-vs-LLM differentiation
and CFO / AI-cost proofs (P9 / P10), use [`proof-modules.md`](proof-modules.md)
or the in-app **Value stories** page (`/value`). Assumes setup is complete and
[`troubleshooting.md`](troubleshooting.md) is open in another tab.

## Salesperson quick start

The app opens in the customer view. The header shows Overview, Payment Performance Management,
and All use cases. Operator controls stay hidden until you press Escape.

1. Open **Overview**. Confirm **Operating normally**, approval near 95.9%, and
   no incident badge.
2. For a general or payments audience, choose **See a revenue-risk incident**.
   For another role, open that use case. Either link starts that role's
   decision and pauses the logical clock at the end of the event.
3. Read the decision card before anything else. On Payment Performance Management the decision
   is the two-minute incident: P2 / Mastercard / GB, approval 88% (−8 points),
   p95 latency 680 ms, and 200 attempts. The hour-wide tiles and lane chart
   are diluted context. They stay still because the clock is paused.
4. Before the guided Aura question, say why the chat is on a page that already
   has metrics. The tiles are the operating picture. The chat is how the room
   investigates a cut those tiles were not built to answer. Then choose the
   guided question for that incident window. The customer demo uses live Aura
   and does not substitute a stored answer. The live answer should name the
   same lane, 200 attempts, about 88% versus 96%, and 680 ms versus 180 ms.
5. If the room equates Aura with a generic LLM, open **Value stories**. If a
   CFO or FP&A buyer is present, use the cost story on that page.
6. Press Escape only when you need operator controls. Resume the stream there
   if you want the clock to move again. Use **Restore clean demo** before the
   next story, and wait for the confirmation.

## Pre-flight, 10 minutes before

Run these in order. Do not skip the last one; it is the only check that proves
what you are about to say out loud is true.

```bash
cd simulator
python -m fintech_demo status     # is a run active, is the stream advancing
```

1. Confirm the simulator process is running. Before any story, the logical
   clock should be advancing. After a story starts, a paused clock is correct.
2. Open `/admin`. Every pre-flight check must be green. It reports database
   reachability, an active run, stream freshness, the baseline checksum, the
   Analyst mode, and whether a Domain key is configured. The customer demo
   expects `ANALYST_MODE=live`.
3. Open `/admin/domain-check` and run the known-question suite. Every question
   must come back from live Aura. This takes a few minutes, which is why you
   start ten minutes early.
4. Reset to a clean baseline, then resume the stream. Wait for both
   confirmations. Escape back to the customer view.
5. Open **Overview** and confirm the baseline is healthy: approval near 95.9%,
   p95 latency near 229 ms, and **Operating normally**. If an incident is
   already showing, reset again.

If live Aura is unavailable, present the decision card and the change table.
Do not switch the room to a stored answer while the server is in live mode;
the customer view will not use that fallback.

## Anchor coverage and status

The application catalog covers eight business stories:

- A1 Digital Funnel Performance
- A2 Payment Performance Management
- A3 Fraud Strategy Optimization
- A4 Financial Crime Operations
- A5 Dispute Operations Performance
- A6 Liquidity and Funding Management
- A7 Credit and Exposure Management
- A8 Embedded Insights Strategy

All eight anchors are available end to end with deterministic widgets,
scenario injection, Analyst fixtures, and record-level evidence. Live Analyst
mode additionally requires the corresponding Domain key. The exact scenario
contract and evidence path for every anchor is recorded in
[`anchor-catalog.md`](anchor-catalog.md).

## The A2 Payment Performance Management story, about 12 minutes

### Set the scene, 1 minute

Open **Overview**. Say what the audience is looking at: a payments operation
on synthetic data. The clock is moving, and the network is operating normally.
Approval sits near 95.9% for the last hour. Establish that calm first, because
the incident only lands if the audience saw it.

### Reveal the incident, 1 minute

Choose **See a revenue-risk incident**. Say what will happen before the page
finishes loading: a two-minute timeout burst on P2 / Mastercard / GB. Approval
on that route falls from 96% to 88%, timeout declines rise from 1% to 7%, and
p95 latency rises from 180 ms to 680 ms.

The page injects that event and pauses the logical clock. The decision card,
the hour-wide context, and Aura then inspect the same moment. Resume the stream
only after the story, from the operator view.

### Read the decision, 2 minutes

Start with the incident card, not the network tiles. The decision lane is
P2 / Mastercard / GB: 88% approval, −8 points, 680 ms, and 200 attempts. Then
open **Change impact**. The measured values match the expected signature, and
the table says so.

Point to the hour-wide lane chart only as context. It dilutes the two-minute
burst across the hour, so the same route moves by a smaller amount there. That
chart stays put because the clock is paused. The incident card and Aura are
the decision.

### Investigate with Analyst, 5 minutes

Say this before you choose a question. The room needs to hear why the chat is
here when the page already shows approval, latency, declined value, and lane
movement.

> The tiles are the operating picture. They show that something moved. The chat
> is how you investigate a question those tiles were not built to answer. You
> can ask for a cut this page does not have: processors for the last hour
> against the prior seven days, declines by merchant category and response
> code, or that same breakdown for Mastercard only.
>
> The question goes to Aura Analyst in plain language, scoped to this decision’s
> Domain and curated views. Analyst writes SQL, runs it on SingleStore, and
> returns a summary, table, or chart. The generated SQL stays available, so the
> number can be checked. A follow-up keeps the prior window and breakdown, so
> you do not restate them. On a route or customer page, the selected record is
> attached, and the question stays on that lane or that customer.
>
> Analyst assembles the evidence. It will not take the operational action. A
> request to reroute traffic is refused. Payment operations still owns routing
> and processor action.

Then choose this starter:

> For P2 / Mastercard / GB in the incident window, compare approval and p95
> latency with its prior seven-day baseline.

The answer should be one row: 200 incident attempts, 88% versus about 96%, and
680 ms versus 180 ms. It should not describe a later hour or a different
attempt count. Open **Show generated SQL** for a technical audience.

Then use the decline-mix starter if the room wants the response-code pattern.
Aura explains the measured evidence. Payment operations still owns routing and
processor action.

### Drill to the evidence, 2 minutes

Open the affected route, then one timeout authorization. Tick **Scenario events
only** on the route page. Each attempt behind the aggregate is labeled, with
its response code and latency.

### Close, 1 minute

Leave the incident visible through the closing question. After the meeting,
restore the clean baseline and resume the stream for the next session. Every
number is reproducible from the seed, and Analyst reads curated, read-only,
run-scoped views.

## Customer view and operator view

The customer view is the default. It hides Demo controls, the scenario panel,
and the operator navigation. Press **Esc** to open the operator view, where
you can resume the stream, change speed, restore the baseline, or run a story
manually. Press **Esc** again, or turn presentation mode back on, before the
audience returns.

## Personas

| Persona | Emphasis |
| --- | --- |
| Payments operations lead | Impact, lanes, and what to do next |
| Data platform engineer | Provenance, generated SQL, view scoping, determinism |
| Executive | Headline movement and business consequence, minimal annotation |

Switching persona never changes a number. It changes framing and how much
technical annotation is shown, so you can run the same story twice for different
rooms.

## Recovering mid-demo

The launchpad and Demo controls provide the two recovery actions without CLI
work:

- **Restore clean demo** when the story has already run or the numbers need to
  return to baseline. Wait for confirmed success, then resume the stream.
  A timeout or rejection is a failure.
- Stay on the decision card when a live Aura call fails. The customer demo
  does not replace that call with a stored answer.

| Symptom | Do this |
| --- | --- |
| Clock paused after a story | Expected. Resume from the operator view when the story is finished |
| Clock paused before any story | Check the simulator terminal; `python -m fintech_demo run`, then resume |
| Analyst call fails | Keep the incident card and change table; do not invent a stored answer |
| Numbers look wrong | Choose **Restore clean demo**; if it still looks wrong, verify after the session |
| Scenario already fired | Choose **Restore clean demo**, resume, then open the story again |
| Reset rejected | The clone did not match the checksum. Re-seed after the session; see troubleshooting |

Never re-seed mid-demo. It takes minutes and the audience is watching. Reset is
the in-demo recovery tool; re-seeding is a repair.

## After the session

Press Ctrl+C in the terminal running `scripts/startup.sh`, or, from the
repository root:

```bash
scripts/shutdown.sh
```

This stops the app and the simulator, waits for the leader lease to expire, and
resets to the verified baseline. The next `scripts/startup.sh` begins from that
same baseline: same seed, same epoch, speed 1x, and no scenario injected.

If the processes were started by hand, `shutdown.sh` still stops a simulator or
app whose working directory is this repository. Capture `/admin/data` and
`.demo/simulator.log` before shutting down when something behaved unexpectedly,
then run `verify` to establish whether the data or the presentation was at fault.

`python -m fintech_demo reset` remains the data-only recovery when the simulator
is already stopped.
