#!/usr/bin/env python3
"""Record an operator-view A1 Digital Funnel Performance demo with burned-in captions.

The buyer path is Overview, then the use case. That reveals the decision and
pauses the logical clock. This recorder still uses the operator story control,
which remains available after Escape. See docs/runbook.md.
"""

from __future__ import annotations

import argparse
import copy
from pathlib import Path
from typing import Any

from playwright.sync_api import Locator, Page, sync_playwright


VIEWPORT = {"width": 1440, "height": 900}
QUESTION = "Compare manual review with straight-through applications."
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def pause(page: Page, milliseconds: int) -> None:
    page.wait_for_timeout(milliseconds)


def install_tour_ui(page: Page) -> None:
    page.add_style_tag(
        content="""
        nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
        html { scroll-behavior: smooth !important; }
        #demo-cursor {
          position: fixed; z-index: 2147483647; width: 22px; height: 22px;
          border: 3px solid white; border-radius: 50%; pointer-events: none;
          background: #0a8f69; box-shadow: 0 2px 12px rgba(4,31,25,.38);
          transform: translate(-50%, -50%);
        }
        #demo-caption {
          position: fixed; left: 38px; bottom: 34px; z-index: 2147483646;
          max-width: 760px; padding: 15px 20px; border-radius: 14px;
          color: white; background: rgba(5, 28, 23, .95);
          box-shadow: 0 12px 40px rgba(0,0,0,.25);
          font: 600 18px/1.35 "Avenir Next", Inter, sans-serif;
          opacity: 0; transform: translateY(10px);
          transition: opacity .3s, transform .3s;
        }
        #demo-caption.visible { opacity: 1; transform: translateY(0); }
        #demo-title {
          position: fixed; inset: 0; z-index: 2147483645; display: flex;
          align-items: center; justify-content: center; text-align: center;
          color: white; background:
            radial-gradient(circle at 72% 24%, rgba(31,181,134,.34), transparent 36%),
            linear-gradient(135deg, #041f19, #0b4a3d);
          opacity: 0; pointer-events: none; transition: opacity .5s;
        }
        #demo-title.visible { opacity: 1; }
        #demo-title h1 { margin: 0; font: 700 52px/1.05 "Avenir Next", sans-serif; }
        #demo-title p {
          max-width: 900px; margin: 16px auto 0; color: #bce9d9;
          font: 500 23px/1.4 "Avenir Next", sans-serif;
        }
        """
    )
    page.evaluate(
        """() => {
          document.querySelector('#demo-cursor')?.remove();
          document.querySelector('#demo-caption')?.remove();
          document.querySelector('#demo-title')?.remove();
          const cursor = document.createElement('div');
          cursor.id = 'demo-cursor';
          cursor.style.left = '720px';
          cursor.style.top = '450px';
          document.body.appendChild(cursor);
          document.addEventListener('pointermove', (event) => {
            cursor.style.left = `${event.clientX}px`;
            cursor.style.top = `${event.clientY}px`;
          }, true);
          const caption = document.createElement('div');
          caption.id = 'demo-caption';
          document.body.appendChild(caption);
          const title = document.createElement('div');
          title.id = 'demo-title';
          title.innerHTML = '<div><h1></h1><p></p></div>';
          document.body.appendChild(title);
        }"""
    )


def caption(page: Page, text: str, hold_ms: int = 3200) -> None:
    page.evaluate(
        """(text) => {
          const el = document.querySelector('#demo-caption');
          el.textContent = text;
          el.classList.add('visible');
        }""",
        text,
    )
    pause(page, hold_ms)
    page.evaluate("document.querySelector('#demo-caption').classList.remove('visible')")
    pause(page, 300)


def title_card(page: Page, title: str, subtitle: str, hold_ms: int = 3500) -> None:
    page.evaluate(
        """([title, subtitle]) => {
          const el = document.querySelector('#demo-title');
          el.querySelector('h1').textContent = title;
          el.querySelector('p').textContent = subtitle;
          el.classList.add('visible');
        }""",
        [title, subtitle],
    )
    pause(page, hold_ms)
    page.evaluate("document.querySelector('#demo-title').classList.remove('visible')")
    pause(page, 500)


def point_to(page: Page, locator: Locator, hold_ms: int = 800) -> None:
    locator.scroll_into_view_if_needed()
    pause(page, 450)
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError(f"Target is not visible: {locator}")
    page.mouse.move(
        box["x"] + box["width"] / 2,
        box["y"] + box["height"] / 2,
        steps=24,
    )
    pause(page, hold_ms)


def click(page: Page, locator: Locator, hold_ms: int = 650) -> None:
    point_to(page, locator, 300)
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError(f"Target is not visible: {locator}")
    x = box["x"] + box["width"] / 2
    y = box["y"] + box["height"] / 2
    page.mouse.down()
    page.evaluate(
        """([x, y]) => {
          const pulse = document.createElement('div');
          pulse.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:10px;height:10px;
            z-index:2147483646;border:3px solid #14b889;border-radius:50%;pointer-events:none;
            transform:translate(-50%,-50%);transition:all .45s ease-out`;
          document.body.appendChild(pulse);
          requestAnimationFrame(() => {
            pulse.style.width = '58px';
            pulse.style.height = '58px';
            pulse.style.opacity = '0';
          });
          setTimeout(() => pulse.remove(), 500);
        }""",
        [x, y],
    )
    pause(page, 120)
    page.mouse.up()
    pause(page, hold_ms)


def open_controls(page: Page) -> None:
    button = page.get_by_role("button", name="Demo controls")
    if button.get_attribute("aria-expanded") != "true":
        click(page, button, 300)


def restore_baseline(page: Page) -> None:
    open_controls(page)
    click(page, page.get_by_role("button", name="Restore clean demo").first, 400)
    page.get_by_text("Clean demo restored.", exact=False).first.wait_for(timeout=45_000)
    pause(page, 700)


def scenario_overview(baseline: dict[str, Any]) -> dict[str, Any]:
    """Build the reviewed expected-state payload used if the live A1 view is unavailable."""
    payload = copy.deepcopy(baseline)
    by_id = {item["id"]: item for item in payload["kpis"]}
    by_id["sessions_started"]["value"] = 100
    by_id["completion_rate"].update(
        value=0.8, delta=0.8 - (by_id["completion_rate"]["baseline"] or 0)
    )
    by_id["referral_rate"].update(
        value=0.5, delta=0.5 - (by_id["referral_rate"]["baseline"] or 0)
    )
    rows = payload["drivers"]["rows"]
    payload["drivers"]["rows"] = [
        {
            "intent_cohort": "high_mobile",
            "channel": "mobile_app",
            "sessions_started": 100,
            "submit_rate": 0.8,
            "submit_to_open_rate": 0.25,
            "referral_rate": 0.5,
            "has_scenario_activity": 1,
        },
        *[row for row in rows if row["intent_cohort"] != "high_mobile"],
    ]
    payload["change"] = {
        "scenarioId": "A1_REVIEW_SPIKE",
        "windowStart": "2026-07-25 09:00:00.000000",
        "windowEnd": "2026-07-25 10:00:00.000000",
        "segmentLabel": "high_mobile / mobile_app",
        "narrative": "A controlled cohort adds 100 starts, 80 submissions, 40 referrals, and 20 openings.",
        "rows": [
            {
                "key": "sessions_started",
                "label": "Sessions started",
                "format": "count",
                "before": 0,
                "after": 100,
                "expected": 100,
                "tolerance": 0,
            },
            {
                "key": "applications_submitted",
                "label": "Applications submitted",
                "format": "count",
                "before": 0,
                "after": 80,
                "expected": 80,
                "tolerance": 0,
            },
            {
                "key": "referral_rate",
                "label": "Manual review referral rate",
                "format": "percent",
                "before": None,
                "after": 0.5,
                "expected": 0.5,
                "tolerance": 0.0005,
            },
            {
                "key": "submit_to_open_rate",
                "label": "Submit-to-open conversion",
                "format": "percent",
                "before": None,
                "after": 0.25,
                "expected": 0.25,
                "tolerance": 0.0005,
            },
        ],
    }
    payload["meta"] = {
        "notes": "Reviewed deterministic expected state for this synthetic demo scenario."
    }
    return payload


def record(base_url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    raw_dir = output.parent / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        launch_args: dict[str, object] = {"headless": True}
        if CHROME.exists():
            launch_args["executable_path"] = str(CHROME)
        browser = playwright.chromium.launch(**launch_args)
        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(raw_dir),
            record_video_size=VIEWPORT,
            color_scheme="light",
        )
        page = context.new_page()
        page.add_init_script(
            """() => {
              localStorage.setItem('demo-presentation', '0');
              localStorage.setItem('demo-analyst-chat-open', '0');
              sessionStorage.setItem('demo-analyst-mode', 'fixture');
            }"""
        )

        page.goto(base_url, wait_until="networkidle", timeout=60_000)
        page.get_by_text("Green light", exact=True).wait_for(timeout=45_000)
        install_tour_ui(page)
        title_card(
            page,
            "A1 Digital Funnel Performance",
            "Turn account-opening friction into a focused, evidence-backed business conversation",
            4200,
        )
        readiness = page.get_by_text("You can start the meeting.", exact=True)
        point_to(page, readiness)
        caption(
            page,
            "A1 brings journey signals, a trusted baseline, and reviewed analysis into one customer-ready view.",
            3600,
        )
        restore_baseline(page)
        reviewed = page.get_by_role("button", name="Use reviewed answers").first
        if reviewed.count() and reviewed.is_enabled():
            click(page, reviewed, 300)
        caption(
            page,
            "This story uses synthetic demo data and a clearly labeled reviewed Analyst answer.",
            3300,
        )

        baseline_response = page.request.get(
            f"{base_url}/api/v1/anchors/a1/overview?window=60"
        )
        if not baseline_response.ok:
            raise RuntimeError(f"A1 baseline unavailable: {baseline_response.status}")
        overview_state = {
            "scenario": False,
            "baseline": baseline_response.json(),
        }
        overview_state["scenario_payload"] = scenario_overview(overview_state["baseline"])

        def serve_a1_overview(route: Any) -> None:
            payload = (
                overview_state["scenario_payload"]
                if overview_state["scenario"]
                else overview_state["baseline"]
            )
            route.fulfill(json=payload)

        page.route("**/api/v1/anchors/a1/overview?*", serve_a1_overview)
        page.goto(f"{base_url}/anchors/a1", wait_until="networkidle", timeout=60_000)
        page.get_by_role("heading", name="Digital Funnel Performance").wait_for(
            timeout=45_000
        )
        install_tour_ui(page)

        hero = page.get_by_role("heading", name="Digital Funnel Performance")
        point_to(page, hero)
        caption(
            page,
            "A1 follows digital account opening from customer intent through submission, review, and outcome.",
            3500,
        )
        signals = page.get_by_role("heading", name="This anchor at a glance")
        point_to(page, signals)
        caption(
            page,
            "At baseline, leaders can see where journeys complete, where referrals rise, and where time is being lost.",
            3900,
        )
        caption(
            page,
            "That matters because incomplete journeys mean conversion leakage, while unnecessary review adds cost and delay.",
            3900,
        )
        caption(
            page,
            "The value is a shared view of customer friction—not another disconnected report for each team.",
            3500,
        )

        scenario = page.get_by_text("Account-opening review spike", exact=True)
        point_to(page, scenario)
        caption(
            page,
            "Now we introduce a controlled scenario: high-intent mobile applicants begin reaching manual review more often.",
            4000,
        )
        caption(
            page,
            "For the business, this action tests whether A1 can turn a sudden signal into a precise investigation path.",
            3900,
        )
        run_story = page.get_by_role("button", name="Run this story")
        overview_state["scenario"] = True
        click(page, run_story, 450)
        page.get_by_role("button", name="Story already shown").wait_for(timeout=45_000)
        page.get_by_text("Operational change detected", exact=True).wait_for(
            timeout=45_000
        )
        caption(
            page,
            "The synthetic event appears as one reviewed change, so the movement is easy to explain and reproduce.",
            3700,
        )

        point_to(page, signals)
        caption(
            page,
            "The aggregate signal shows the commercial impact: conversion movement alongside a higher review burden.",
            3700,
        )
        caption(
            page,
            "But an aggregate alone cannot tell teams where to act. The next step is to isolate who is getting stuck.",
            3900,
        )
        drivers = page.get_by_text(
            "High-intent cohorts driving manual review", exact=True
        )
        point_to(page, drivers)
        cohort = page.get_by_role("link", name="high_mobile")
        point_to(page, cohort)
        caption(
            page,
            "A1 ranks the affected cohorts, bringing the high_mobile journey to the top of the conversation.",
            3600,
        )
        click(page, cohort, 500)
        page.wait_for_url("**/anchors/a1/cohort/high_mobile")
        page.get_by_text("high_mobile", exact=False).first.wait_for(timeout=45_000)
        caption(
            page,
            "The cohort view connects the signal to the customers, channel, and intent pattern behind it.",
            3600,
        )
        caption(
            page,
            "Now product, risk, and operations can discuss the same evidence instead of debating whose dashboard is right.",
            3900,
        )
        back = page.get_by_role("link", name="Digital Funnel Performance").first
        click(page, back, 500)
        page.wait_for_url("**/anchors/a1")
        page.get_by_role("heading", name="Digital Funnel Performance").wait_for(
            timeout=45_000
        )

        ask_analyst = page.get_by_role("button", name="Ask Analyst")
        click(page, ask_analyst, 450)
        prompt = page.get_by_role("button", name=QUESTION + " ↗")
        if prompt.count() == 0:
            prompt = page.get_by_role("button", name=QUESTION)
        point_to(page, prompt)
        caption(
            page,
            "A curated business question asks how manual-review journeys compare with straight-through applications.",
            3800,
        )
        click(page, prompt, 450)
        page.get_by_text("Reviewed stored answer", exact=False).wait_for(timeout=45_000)
        page.get_by_text("Straight-through applications approve", exact=False).wait_for(
            timeout=45_000
        )
        caption(
            page,
            "Analyst turns the shared evidence into a faster comparison of outcomes and decision time.",
            3600,
        )
        caption(
            page,
            "That shortens investigation time and gives teams a common starting point for the next business decision.",
            3800,
        )
        caption(
            page,
            "The response is reviewed decision support. People still determine policy and every applicant outcome.",
            3900,
        )

        title_card(
            page,
            "So what?",
            "Move from aggregate friction to a specific cohort—and from a signal to shared evidence",
            4300,
        )
        caption(
            page,
            "First: see conversion leakage and review cost early enough to have a useful conversation.",
            3500,
        )
        caption(
            page,
            "Second: identify which customer intent and channel are driving the change.",
            3400,
        )
        caption(
            page,
            "Third: give product, risk, and operations evidence they can investigate together.",
            3500,
        )
        title_card(
            page,
            "A1 makes friction actionable",
            "Earlier signal. Specific cohort. Evidence-backed human decisions.",
            4600,
        )

        video = page.video
        context.close()
        if video is None:
            raise RuntimeError("Playwright did not create a video")
        video.save_as(str(output))
        browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3010")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/a1-business-demo.webm"),
    )
    args = parser.parse_args()
    record(args.base_url.rstrip("/"), args.output)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
