#!/usr/bin/env python3
"""Record an operator-view A1 Digital Funnel Performance demo.

The buyer path reveals the decision from the use case and pauses the logical
clock. This recorder still uses the operator story control. See docs/runbook.md.
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
          max-width: 700px; padding: 15px 20px; border-radius: 14px;
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
        #demo-title p { margin: 16px 0 0; color: #bce9d9; font: 500 23px/1.4 "Avenir Next", sans-serif; }
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


def caption(page: Page, text: str, hold_ms: int = 2600) -> None:
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
    pause(page, 350)


def title_card(page: Page, title: str, subtitle: str, hold_ms: int = 2800) -> None:
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
    pause(page, 550)


def point_to(page: Page, locator: Locator, hold_ms: int = 900) -> None:
    locator.scroll_into_view_if_needed()
    pause(page, 500)
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError(f"Target is not visible: {locator}")
    page.mouse.move(
        box["x"] + box["width"] / 2,
        box["y"] + box["height"] / 2,
        steps=24,
    )
    pause(page, hold_ms)


def click(page: Page, locator: Locator, hold_ms: int = 700) -> None:
    point_to(page, locator, 350)
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
    restore = page.get_by_role("button", name="Restore clean demo").first
    click(page, restore, 400)
    page.get_by_text("Clean demo restored.", exact=False).first.wait_for(timeout=45_000)
    pause(page, 900)


def scenario_overview(baseline: dict[str, Any]) -> dict[str, Any]:
    """Build the reviewed A1 expected-state payload used when the live view is unavailable."""
    payload = copy.deepcopy(baseline)
    by_id = {item["id"]: item for item in payload["kpis"]}
    by_id["sessions_started"]["value"] = 100
    by_id["completion_rate"].update(value=0.8, delta=0.8 - (by_id["completion_rate"]["baseline"] or 0))
    by_id["referral_rate"].update(value=0.5, delta=0.5 - (by_id["referral_rate"]["baseline"] or 0))

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
        "notes": "Reviewed deterministic A1 expected-state payload used for recording."
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

        # Green-light readiness and a clean, repeatable starting point.
        page.goto(base_url, wait_until="networkidle", timeout=60_000)
        page.get_by_text("Green light", exact=True).wait_for(timeout=45_000)
        install_tour_ui(page)
        title_card(
            page,
            "A1 Digital Funnel Performance",
            "From digital intent to measurable conversion evidence",
        )
        readiness = page.get_by_text("You can start the meeting.", exact=True)
        point_to(page, readiness)
        caption(
            page,
            "Green light: data, stream, baseline, and reviewed Analyst answers are ready.",
            3000,
        )
        restore_baseline(page)
        reviewed = page.get_by_role("button", name="Use reviewed answers").first
        if reviewed.count() and reviewed.is_enabled():
            click(page, reviewed, 350)
        caption(page, "We start from a verified clean baseline and use a clearly labeled reviewed Analyst response.")

        baseline_response = page.request.get(f"{base_url}/api/v1/anchors/a1/overview?window=60")
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

        # Establish the A1 baseline.
        page.goto(f"{base_url}/anchors/a1", wait_until="networkidle", timeout=60_000)
        page.get_by_role("heading", name="Digital Funnel Performance").wait_for(timeout=45_000)
        install_tour_ui(page)
        hero = page.get_by_role("heading", name="Digital Funnel Performance")
        point_to(page, hero)
        caption(page, "A1 tracks the account-opening journey from session start through review and outcome.")
        signals = page.get_by_role("heading", name="This anchor at a glance")
        point_to(page, signals)
        caption(page, "The healthy baseline shows starts, completion, manual-review referrals, and decision time.")

        # Inject the deterministic review-spike story.
        scenario = page.get_by_text("Account-opening review spike", exact=True)
        point_to(page, scenario)
        caption(page, "Now we introduce a controlled spike in high-intent applicants referred to manual review.")
        run_story = page.get_by_role("button", name="Run this story")
        overview_state["scenario"] = True
        click(page, run_story, 450)
        page.get_by_role("button", name="Story already shown").wait_for(timeout=45_000)
        page.get_by_text("Operational change detected", exact=True).wait_for(timeout=45_000)
        caption(page, "The event lands as one complete, deterministic change in synthetic data.")

        # Show the KPI movement, ranked cohort, and cohort detail.
        point_to(page, signals)
        caption(page, "The KPIs update immediately, making the conversion and referral movement visible.")
        drivers = page.get_by_text("High-intent cohorts driving manual review", exact=True)
        point_to(page, drivers)
        cohort = page.get_by_role("link", name="high_mobile")
        point_to(page, cohort)
        caption(page, "The ranked cohort view isolates high_mobile as the largest referral-rate change.")
        click(page, cohort, 500)
        page.wait_for_url("**/anchors/a1/cohort/high_mobile")
        page.get_by_text("high_mobile", exact=False).first.wait_for(timeout=45_000)
        caption(page, "Drill-down keeps the audience on the affected cohort and its supporting measures.")
        back = page.get_by_role("link", name="Digital Funnel Performance").first
        click(page, back, 500)
        page.wait_for_url("**/anchors/a1")
        page.get_by_role("heading", name="Digital Funnel Performance").wait_for(timeout=45_000)

        # Use a reviewed, labeled Analyst answer.
        ask_analyst = page.get_by_role("button", name="Ask Analyst")
        click(page, ask_analyst, 450)
        prompt = page.get_by_role("button", name=QUESTION + " ↗")
        if prompt.count() == 0:
            prompt = page.get_by_role("button", name=QUESTION)
        point_to(page, prompt)
        caption(page, "Aura Analyst continues the investigation with a suggested business question.")
        click(page, prompt, 450)
        page.get_by_text("Reviewed stored answer", exact=False).wait_for(timeout=45_000)
        page.get_by_text("Straight-through applications approve", exact=False).wait_for(timeout=45_000)
        caption(
            page,
            "The reviewed response compares approval and decision time across manual and straight-through paths.",
            3400,
        )
        caption(
            page,
            "This is decision support: Analyst explains measured activity but does not approve or decline an applicant.",
            3200,
        )

        # Demonstrate reset and recovery.
        close_chat = page.get_by_role("button", name="Close Analyst chat")
        click(page, close_chat, 300)
        overview_state["scenario"] = False
        restore_baseline(page)
        page.goto(f"{base_url}/anchors/a1", wait_until="networkidle", timeout=60_000)
        page.get_by_text("Nominal", exact=True).wait_for(timeout=45_000)
        install_tour_ui(page)
        nominal = page.get_by_text("Nominal", exact=True)
        point_to(page, nominal)
        caption(page, "Restore clean demo returns A1 to nominal operation, ready for the next meeting.")
        title_card(
            page,
            "See intent earlier",
            "Baseline → measurable change → cohort evidence → clean recovery",
            3200,
        )

        video = page.video
        context.close()
        if video is None:
            raise RuntimeError("Playwright did not create a video")
        video.save_as(str(output))
        browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/a1-demo-captioned.webm"),
    )
    args = parser.parse_args()
    record(args.base_url.rstrip("/"), args.output)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
