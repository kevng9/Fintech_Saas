# Runbook

Use this runbook to operate the demo before, during, and after a presentation.

The text follows ASD-STE100 writing rules. Each sentence is short. Each step has one action. Button names and technical names stay as they appear in the product.

For the speaker script and the times, use the [10-minute presenter script](demo-script.md).

For the persona, the decision, and the scenario contract, use the [fintech anchor catalog](anchor-catalog.md).

That catalog also has the evidence path and the talk track for A1 through A8.

For the Aura and LLM comparison, and for the CFO cost proofs P9 and P10, use [proof-modules.md](proof-modules.md). You can also open the **Value stories** page at `/value`.

Setup must be complete. Keep [troubleshooting.md](troubleshooting.md) open in another tab.

## Salesperson quick start

The app opens in the customer view.

The header shows **Overview**, **Payment Performance Management**, and **All use cases**.

Operator controls stay hidden until you press Escape.

1. Open **Overview**.
2. Make sure the status shows **Operating normally**.
3. Make sure the approval rate is near 95.9 percent.
4. Make sure there is no incident badge.
5. For a payments audience, select **See a revenue-risk incident**.
6. For another role, open that use case.
7. The link starts that story.
8. The link stops the logical clock at the end of the event.
9. Read the decision card first.
10. On Payment Performance Management, read the two-minute incident.
11. The lane is P2 / Mastercard / GB.
12. Approval is 88 percent. That is 8 points lower.
13. The p95 latency is 680 ms.
14. The attempt count is 200.
15. The hour tiles and the lane chart are context for the full hour.
16. Those values change by a smaller amount.
17. They stay still because the logical clock is stopped.
18. Before the Aura question, say why the chat is on the page.
19. The tiles show the operation.
20. The tiles show that a value changed.
21. The chat answers a question that the tiles do not answer.
22. Then select the guided question for that incident window.
23. The customer demo uses live Aura.
24. The customer demo does not use a stored answer.
25. The live answer must name the same lane.
26. The live answer must name 200 attempts.
27. The live answer must name about 88 percent against 96 percent.
28. The live answer must name 680 ms against 180 ms.
29. If the audience treats Aura as a generic LLM, open **Value stories**.
30. If a CFO or an FP&A buyer is present, use the cost story on that page.
31. Press Escape only when you need the operator controls.
32. Resume the stream there if you want the logical clock to move.
33. Select **Restore clean demo** before the next story.
34. Wait for the confirmation.

## Pre-flight, 10 minutes before

Do these checks in order.

Do not skip the known-question check. It is the check that proves your spoken numbers.

```bash
cd simulator
python -m fintech_demo status
```

The command shows whether a run is active. It also shows whether the stream is moving.

1. Make sure the simulator process is running.
2. Before a story, the logical clock must move.
3. After a story starts, a stopped logical clock is correct.
4. Open `/admin`.
5. Every pre-flight check must be green.
6. The page shows database reachability.
7. The page shows an active run.
8. The page shows stream freshness.
9. The page shows the baseline checksum.
10. The page shows the Analyst mode.
11. The page shows whether a Domain key is configured.
12. The customer demo must use `ANALYST_MODE=live`.
13. Open `/admin/domain-check`.
14. Run the known-question suite.
15. Every question must come back from live Aura.
16. This check takes a few minutes. Start it ten minutes early.
17. Reset the demo to a clean baseline.
18. Resume the stream.
19. Wait for both confirmations.
20. Press Escape to return to the customer view.
21. Open **Overview**.
22. Make sure the approval rate is near 95.9 percent.
23. Make sure the p95 latency is near 229 ms.
24. Make sure the status shows **Operating normally**.
25. If an incident is already on the page, reset the demo again.

If live Aura is not available, show the decision card and the change table.

Do not change the demo to a stored answer while the server is in live mode.

The customer view will not use that stored answer.

## Anchor coverage and status

The application has eight business stories:

- A1 Digital Funnel Performance
- A2 Payment Performance Management
- A3 Fraud Strategy Optimization
- A4 Financial Crime Operations
- A5 Dispute Operations Performance
- A6 Liquidity and Funding Management
- A7 Credit and Exposure Management
- A8 Embedded Insights Strategy

All eight anchors are available from end to end.

Each anchor has fixed widgets, scenario injection, Analyst fixtures, and record-level evidence.

Live Analyst mode also needs the Domain key for that anchor.

The scenario contract and the evidence path for each anchor are in [anchor-catalog.md](anchor-catalog.md).

## The A2 Payment Performance Management story, about 12 minutes

### Set the scene, 1 minute

1. Open **Overview**.
2. Say that the audience sees a payments operation.
3. Say that the data is synthetic.
4. Say that the logical clock is moving.
5. Say that the network status is **Operating normally**.
6. Say that approval is near 95.9 percent for the last hour.
7. Let the audience see this calm state before the incident.

### Show the incident, 1 minute

1. Select **See a revenue-risk incident**.
2. Before the page finishes loading, say what will happen.
3. A two-minute timeout burst starts on P2 / Mastercard / GB.
4. Approval on that route falls from 96 percent to 88 percent.
5. Timeout declines rise from 1 percent to 7 percent.
6. The p95 latency rises from 180 ms to 680 ms.
7. The page injects the event.
8. The page stops the logical clock.
9. The decision card, the hour context, and Aura then show the same moment.
10. Resume the stream only after the story.
11. Resume it from the operator view.

### Read the decision, 2 minutes

1. Start with the incident card.
2. Do not start with the network tiles.
3. Read the lane P2 / Mastercard / GB.
4. Read 88 percent approval.
5. Read the drop of 8 points.
6. Read 680 ms.
7. Read 200 attempts.
8. Open **Change impact**.
9. The measured values match the expected values.
10. The table says that they match.
11. Use the hour lane chart only as context.
12. The chart spreads the two-minute burst across the hour.
13. The same route then moves by a smaller amount.
14. The chart stays still because the logical clock is stopped.
15. The incident card and Aura are the decision.

### Investigate with Analyst, 5 minutes

Say these sentences before you select a question:

> The tiles show the operation.
>
> The tiles show that a value changed.
>
> The chat answers a question that the tiles do not answer.
>
> You can ask for processors in the last hour compared with the prior seven days.
>
> You can ask for declines by merchant category and response code.
>
> You can ask for that same breakdown for Mastercard only.
>
> The question goes to Aura Analyst in plain language.
>
> The question uses this decision Domain and the approved views.
>
> Analyst writes SQL.
>
> Analyst runs the SQL on SingleStore.
>
> Analyst returns a summary, a table, or a chart.
>
> The generated SQL stays available.
>
> You can check the number.
>
> A follow-up keeps the prior time window and the prior breakdown.
>
> You do not say them again.
>
> On a route page or a customer page, the selected record stays with the question.
>
> Analyst collects the evidence.
>
> Analyst does not do the operational action.
>
> A request to reroute traffic is refused.
>
> Payment operations still decides routing and processor action.

Then select this starter:

> For P2 / Mastercard / GB in the incident window, compare approval and p95 latency with its prior seven-day baseline.

The answer must be one row.

The row must show 200 incident attempts.

The row must show 88 percent against about 96 percent.

The row must show 680 ms against 180 ms.

The answer must not describe a later hour.

The answer must not use a different attempt count.

For a technical audience, open **Show generated SQL**.

If the audience wants the response-code pattern, use the decline-mix starter.

Aura explains the measured evidence.

Payment operations still decides routing and processor action.

### Go to the evidence, 2 minutes

1. Open the affected route.
2. Open one timeout authorization.
3. Select **Scenario events only** on the route page.
4. Each attempt behind the total has a label.
5. Each attempt shows its response code and its latency.

### Close, 1 minute

1. Keep the incident on the screen through the closing question.
2. After the meeting, restore the clean baseline.
3. Resume the stream for the next session.
4. Each number can be made again from the seed.
5. Analyst reads approved views.
6. Those views are read-only.
7. Those views are limited to the current run.

## The A3 Fraud Strategy proof, about 8 minutes

1. Open **Fraud Strategy Optimization** from **All use cases**.
2. This link does not start the data feed.
3. The first card title is **One question, then the live cases arrive**.
4. The button must show **Start live data**.
5. If the button shows **Live data included**, this loss cluster has already run.
6. Press Escape.
7. Select **Restore clean demo**.
8. Wait for the confirmation.
9. Press Escape again before you present.

Do not use these controls during these eight minutes.

They are other stories. They are described after the close.

- **Show the step-up** is on the next card.
- **Show the burst** is on the next card.
- **Compare this burst on a copy path** is a separate page.

That page keeps the analysis picture at the batch time until the batch step ends.

The picture includes the alerts.

Do not say that alerts wait.

Alerts are immediate.

The full answer around an alert is what a copy makes late.

### 1. Ask once, on the last batch

1. Read step 1 on the first card.
2. Say that analysis uses the last batch.
3. Say that live transactions are not in that picture yet.
4. Scroll to **Add a layer for the decision that cannot wait**.
5. The left side shows six systems and a copy.
6. The right side adds SingleStore beside those systems.
7. Say that the ledger stays.
8. Say that the case system stays.
9. Say that the warehouse stays.
10. Say that a report which can wait one day can stay on the warehouse.
11. Say what is late.
12. Device history is late.
13. Investigator notes are late.
14. Warehouse totals are late.
15. The alert is not late.

Select the featured question:

> For the highest-loss segment, use the confirmed-fraud case with the largest loss as the reference. In one result, list the other cases most similar by investigator-note embedding. For each match, show its JSON reason codes, whether the device is reused, that device's peak alerts in any 10-minute window up to the current logical time, account age, merchant, human disposition, and confirmed loss. Also show total confirmed loss and the false-positive count across those matches.

The answer label is **Before live activity**.

Say what the audience sees:

1. One question compared investigator notes.
2. The question read the JSON reason codes.
3. The question measured the 10-minute peak for each device.
4. The question joined the case records and the merchant records.
5. The question totaled the loss and the false positives.
6. Leave that answer on the screen.

### 2. Include the live transactions

A new set of card-testing alerts will arrive.

In separate systems, the alerts can show immediately.

The notes, the device history, and the warehouse totals can still be on the last copy.

The first answer stays on the screen until that copy is finished.

Here, the cases go into the same database that the question reads.

1. Return to the first card.
2. Select **Start live data**.
3. On the other seven stories, the button name is **Start live data feed**.
4. On fraud, the button name is **Start live data**.
5. The card-testing cases are saved.
6. The logical clock stops at that moment.
7. Step 2 then says that live transactions are included.
8. Point to the loss figure.
9. Point to the false-positive figure.
10. Say that the figures changed because the new cases are visible.
11. Say that a nightly job did not cause the change.

### 3. Ask the same question again

1. Select **Ask again with current data**.
2. This starts a new Aura conversation.
3. The model cannot repeat the baseline from memory.
4. The new answer label is **After live activity**.
5. The baseline answer stays above it.
6. Compare the two answers.
7. The similar-case order can change.
8. The shared device can change in the result.
9. The 10-minute peak can change.
10. The JSON reason codes can change.
11. The confirmed loss can change.
12. The false-positive count can change.
13. All of these values are in the same result.
14. The question does not wait for a copy.
15. The question calculates similarity, evidence, velocity, and loss again.
16. The calculation uses the operation as it is now.
17. A warehouse that loads at night would still show the first answer.

### 4. Name the two properties, then run the SQL

On the result, name only these two properties:

- **Composability.** The question was not set up in advance. It joins live cases with older notes, reason codes, and outcomes.
- **Consistency.** Each answer reads one logical time. The page does not wait for a copy to catch up.

Do not show a concurrency test in this meeting.

This demo does not show an agent count.

This demo does not show a throughput test.

1. Open **Show generated SQL** only after the change is visible.
2. The chips name the workloads.
3. The highlights mark those workloads in the statement.
4. **Vector similarity.** `DOT_PRODUCT` compares investigator-note vectors. The vectors were stored when the cases were loaded. The query does not make the vectors. Say that in one sentence. Then continue.
5. **JSON documents.** `reason_codes` or `JSON_ARRAY_CONTAINS_STRING` reads the alert payload.
6. **Rolling time series.** `aa_fraud_device_velocity` is the exact peak in any 10-minute interval. `through_logical_time` is the end time. A fixed `TIME_BUCKET('10m', ...)` answers a different question.
7. **Relational joins.** The joins connect cases, devices, merchants, accounts, and human dispositions.
8. **Aggregation.** `OVER ()` totals confirmed loss and false positives across the matches.
9. **Live data.** `logical_time` or `demo_active_run` keeps the statement on the current operation.

The same panel shows the statement before it runs.

1. Select **Run query**.
2. The similar cases appear only after the click.
3. The elapsed time appears only after the click.
4. If the statement returns no matches, restore a clean demo.
5. Run the query again.

The A3 Domain must include these views from context version 1.6.0:

- `aa_fraud_case_notes`
- `aa_fraud_alert_timeline`
- `aa_fraud_device_velocity`

Close with the question at the bottom of the page.

Which pipeline, read replica, or fraud system has a high cost because its answer is late?

Run that workload on SingleStore in parallel.

Then state the human limit.

1. The new result is evidence.
2. The result does not decide that a customer committed fraud.
3. The result does not change a rule.
4. Investigators own the case.
5. The fraud strategy team owns the test of a rule.

### Optional: two decisions while attempts are still arriving

Use this part only after the loss-cluster story.

You can also use it instead of that story.

Use it when the audience wants an authorization decision, not a portfolio snapshot.

Both buttons are on the next card.

Neither button records confirmed loss.

A rule does not decide fraud.

Each button stops the logical clock.

Restore a clean demo before you return to the eight-minute story.

**Show the step-up.**

1. A card-not-present charge of $186.40 comes from an unfamiliar country.
2. The score is high enough to stop the charge.
3. The customer approves that same payment from the phone registered to the account.
4. The retry is approved.
5. The case closes as legitimate.
6. Nothing is written off.
7. The first response code is a risk decline.
8. This demo has no authentication-required code.
9. The evidence says that the stop was a step-up.

**Show the burst.**

1. A $2 authorization is approved.
2. Within a few minutes, the same device fails the security code three times.
3. The same device then attempts a charge of $214.60.
4. Those later attempts are declined.
5. One case is opened for review.
6. Confirmed loss stays at zero until an investigator decides.

## Customer view and operator view

The customer view is the default.

The customer view hides Demo controls.

The customer view hides the scenario panel.

The customer view hides the operator navigation.

1. Press Escape to open the operator view.
2. You can resume the stream.
3. You can change the speed.
4. You can restore the baseline.
5. You can run a story manually.
6. On Fraud Strategy, the scenario panel lists the loss cluster.
7. The panel also lists the two authorization decisions.
8. The customer view starts only the loss cluster.
9. It starts that cluster from **Start live data**.
10. Press Escape again before the audience returns.
11. You can also turn presentation mode on again.

## Personas

| Persona | Emphasis |
| --- | --- |
| Payments operations lead | Impact, lanes, and the next action |
| Data platform engineer | Source of the numbers, generated SQL, view scope, and repeatable results |
| Executive | The headline change and the business result, with little technical detail |

A persona change does not change a number.

A persona change changes the framing.

A persona change changes how much technical detail is shown.

You can run the same story twice for two audiences.

## Recovery during the demo

The launchpad and Demo controls give you two recovery actions.

You do not need the command line.

- Select **Restore clean demo** when the story has already run.
- Also select it when the numbers must return to the baseline.
- Wait for the success confirmation.
- Then resume the stream.
- A timeout is a failure.
- A rejection is a failure.
- If a live Aura call fails, stay on the decision card.
- The customer demo does not replace that call with a stored answer.

| What you see | What you do |
| --- | --- |
| The logical clock is stopped after a story | This is correct. Resume from the operator view when the story is finished. |
| The logical clock is stopped before any story | Check the simulator terminal. Run `python -m fintech_demo run`. Then resume. |
| The Analyst call fails | Keep the incident card and the change table. Do not make a stored answer. |
| The numbers look wrong | Select **Restore clean demo**. If the numbers still look wrong, check them after the session. |
| The scenario has already run | Select **Restore clean demo**. Resume. Then open the story again. |
| The reset is rejected | The clone did not match the checksum. Load the data again after the session. See troubleshooting. |

Do not load the data again during the demo.

That repair takes minutes.

The audience is watching.

Reset is the recovery action during the demo.

A new data load is a repair after the session.

## After the session

Press Ctrl+C in the terminal that runs `scripts/startup.sh`.

Or run this command from the repository root:

```bash
scripts/shutdown.sh
```

This command stops the app.

This command stops the simulator.

This command waits until the leader lease expires.

This command resets the data to the checked baseline.

The next `scripts/startup.sh` starts from that same baseline.

The seed is the same.

The epoch is the same.

The speed is 1x.

No scenario is injected.

If you started the processes by hand, `shutdown.sh` still stops them.

It stops a simulator or an app whose working directory is this repository.

If something did not work as expected, save two files before you stop the demo:

- `/admin/data`
- `.demo/simulator.log`

Then run `verify`.

The check shows whether the data or the presentation was wrong.

When the simulator is already stopped, use this command for a data-only recovery:

```bash
python -m fintech_demo reset
```
