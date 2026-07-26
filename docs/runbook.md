# Runbook

How to operate the demo before, during, and after a presentation. For exact
speaker notes and timing, use the
[`10-minute presenter script`](demo-script.md). For the persona, decision,
scenario contract, evidence path, and talk track for A1 through A8, use the
[`fintech anchor catalog`](anchor-catalog.md). Assumes setup is complete and
[`troubleshooting.md`](troubleshooting.md) is open in another tab.

## Pre-flight, 10 minutes before

Run these in order. Do not skip the last one; it is the only check that proves
what you are about to say out loud is true.

```bash
cd simulator
python -m fintech_demo status     # is a run active, is the stream advancing
```

1. Confirm the simulator process is running and the logical clock in the app
   header is advancing.
2. Open `/admin`. Every pre-flight check must be green. It reports database
   reachability, an active run, stream freshness, the baseline checksum, the
   Analyst mode, and whether a Domain key is configured.
3. Open `/admin/domain-check` and run the known-question suite if you are
   presenting in live Analyst mode. Every question must come back correct. This
   takes a few minutes, which is why you start ten minutes early.
4. Reset to a clean baseline from the control strip. Wait for the confirmation.
5. Open the anchor you will present and confirm its baseline state is healthy.
   For A2, approval should be flat near 95.9% and p95 latency near 229 ms.
   If any scenario badge is showing, reset again.

If a check is red and you cannot fix it in two minutes, switch the Analyst
selector to **Fixture**. The dashboard stays fully live; only the Analyst
answers are replayed, and the UI labels them as such. That is a far better
outcome than a failed live call in front of an audience.

## Anchor coverage and status

The application catalog covers eight business stories:

- A1 Digital Journey Intelligence
- A2 Payment Pulse
- A3 Trace the Loss
- A4 Alert-to-Evidence
- A5 Dispute Resolution Lens
- A6 Liquidity Command Center
- A7 Credit Risk Pulse
- A8 Explain My Money

All eight anchors are available end to end with deterministic widgets,
scenario injection, Analyst fixtures, and record-level evidence. Live Analyst
mode additionally requires the corresponding Domain key. The exact scenario
contract and evidence path for every anchor is recorded in
[`anchor-catalog.md`](anchor-catalog.md).

## The A2 Payment Pulse story, about 12 minutes

### Set the scene, 1 minute

Open the launchpad. Say what the audience is looking at: a payments operations
view over a continuously generated synthetic dataset, with a logical clock you
control. Pick the persona that matches the room — the persona selector changes
the framing and the depth of technical annotation, not the numbers.

Move to **A2 Payment Pulse**. Point out the headline tiles sitting flat against
their seven-day baselines. Establish that "normal" is boring, because the
anomaly only lands if the audience saw calm first.

### Inject the disruption, 1 minute

From the scenario panel, fire **A2_PROCESSOR_TIMEOUT**.

Say what will happen *before* it happens, reading from the published expected
deltas shown in the panel: a two-minute burst on one processor and one lane,
timeouts replacing approvals, approval rate down and p95 latency up on that
lane only. Predicting the outcome, then having the data agree, is the point.

The injection is atomic. Widgets go from entirely before to entirely after with
nothing partial in between.

### Notice it, 2 minutes

The affected tile and lane light up. Open **What changed** and walk the three
columns: baseline, after, and the published expectation. The measured values
match the contract exactly, and the panel says so. This is the moment to make
the reproducibility claim, because you are showing it rather than asserting it.

### Investigate with Analyst, 5 minutes

Move to the Analyst workspace and use a conversation starter, or ask in your own
words:

> Which processor and lane drove the change in approvals in the last hour?

Then follow up:

> Show the decline code mix for that lane before and after.

While it streams, narrate what is happening: a natural-language question is
turned into SQL against curated, run-scoped views on a separate Aura workspace,
and the answer comes back as prose plus a table or chart. Open **View SQL** on a
turn. Showing the generated SQL is what converts a demo into evidence for a
technical audience.

Ask one deliberately ambiguous question, such as which processor is performing
"badly". Analyst asks what you mean rather than guessing. Say why that matters:
a tool that quietly picks a definition is worse than one that asks.

### Drill to the evidence, 2 minutes

Click through from the lane to the segment detail, then to a single payment.
Tick "scenario events only" on the segment page. Every individual authorization
attempt behind the aggregate is there, each labelled as scenario-generated, with
its decline code and latency. There is no gap between the headline number and
the row that produced it.

### Close, 1 minute

Reset. The board returns to the verified baseline within seconds and the
checksum is re-verified on the way. Say the two things worth remembering: every
number is reproducible from a seed, and Analyst reads only curated, read-only,
run-scoped views.

## Presentation mode

The control strip is presenter scaffolding. Open **Demo controls** and toggle
**Presentation mode** to hide the strip and scenario panels once you have
injected, so screenshots and recordings show only the product. Exit with
**Exit presentation** in the header, or press **Esc**.

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

| Symptom | Do this |
| --- | --- |
| Clock frozen, unintentionally | Check the simulator terminal; `python -m fintech_demo run` |
| Analyst call fails | Switch the selector to Fixture and carry on |
| Numbers look wrong | Reset; if it still looks wrong, `verify` after the session |
| Scenario already fired | Reset, then re-inject |
| Reset rejected | The clone did not match the checksum. Re-seed after the session; see troubleshooting |

Never re-seed mid-demo. It takes minutes and the audience is watching. Reset is
the in-demo recovery tool; re-seeding is a repair.

## After the session

```bash
python -m fintech_demo reset      # leave the environment clean for the next person
```

If anything behaved unexpectedly, capture `/admin/data` and the simulator log
before resetting, then run `verify` to establish whether the data or the
presentation was at fault.
