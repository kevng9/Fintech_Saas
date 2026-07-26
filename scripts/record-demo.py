#!/usr/bin/env python3
"""Record a polished, captioned Northstar demo clickthrough with Playwright."""

from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import Locator, Page, sync_playwright


VIEWPORT = {"width": 1440, "height": 900}
QUESTION = (
    "During the weakest window, rank processors and rails against the prior "
    "seven-day baseline."
)


def pause(page: Page, milliseconds: int) -> None:
    page.wait_for_timeout(milliseconds)


def install_tour_ui(page: Page) -> None:
    page.add_style_tag(
        content="""
        nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
        html { scroll-behavior: smooth !important; }
        #demo-cursor {
          position: fixed; z-index: 2147483647; width: 22px; height: 22px;
          border: 3px solid #fff; border-radius: 50%; pointer-events: none;
          background: #0a8f69; box-shadow: 0 2px 12px rgba(4,31,25,.35);
          transform: translate(-50%, -50%); transition: width .12s, height .12s;
        }
        #demo-caption {
          position: fixed; left: 38px; bottom: 34px; z-index: 2147483646;
          max-width: 650px; padding: 15px 20px; border-radius: 14px;
          color: white; background: rgba(5, 28, 23, .94);
          box-shadow: 0 12px 40px rgba(0,0,0,.24);
          font: 600 18px/1.35 "Avenir Next", Inter, sans-serif;
          opacity: 0; transform: translateY(10px);
          transition: opacity .3s, transform .3s;
        }
        #demo-caption.visible { opacity: 1; transform: translateY(0); }
        #demo-title {
          position: fixed; inset: 0; z-index: 2147483645; display: flex;
          align-items: center; justify-content: center; text-align: center;
          color: white; background:
            radial-gradient(circle at 70% 25%, rgba(31,181,134,.32), transparent 36%),
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


def title_card(page: Page, title: str, subtitle: str, hold_ms: int = 3000) -> None:
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
    pause(page, 600)


def point_to(page: Page, locator: Locator, hold_ms: int = 1500) -> None:
    locator.scroll_into_view_if_needed()
    pause(page, 650)
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError("Target is not visible")
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=24)
    pause(page, hold_ms)


def click(page: Page, locator: Locator, hold_ms: int = 900) -> None:
    point_to(page, locator, 450)
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError("Target is not visible")
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
            pulse.style.width = '58px'; pulse.style.height = '58px'; pulse.style.opacity = '0';
          });
          setTimeout(() => pulse.remove(), 500);
        }""",
        [x, y],
    )
    pause(page, 120)
    page.mouse.up()
    pause(page, hold_ms)


def record(base_url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    raw_dir = output.parent / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(raw_dir),
            record_video_size=VIEWPORT,
            color_scheme="light",
        )
        page = context.new_page()
        page.goto(base_url, wait_until="networkidle", timeout=60_000)
        install_tour_ui(page)

        title_card(
            page,
            "Northstar Payments Intelligence",
            "From portfolio signal to payment evidence",
        )
        caption(page, "Monitor authorization health against your own operating baseline")

        open_operations = page.get_by_role("link", name="Open payment operations")
        click(page, open_operations)
        page.wait_for_url("**/anchors/a2")
        page.wait_for_load_state("networkidle")
        install_tour_ui(page)
        caption(page, "A single operating view for approval, latency, timeouts, and declined value")

        signals = page.get_by_text("Key operating signals", exact=True)
        point_to(page, signals)
        pause(page, 2200)
        lane_movement = page.get_by_text("Lane movement", exact=True)
        point_to(page, lane_movement)
        caption(page, "Every payment route is compared with its own seven-day baseline")

        drill = page.get_by_text("Run an operational drill", exact=True)
        point_to(page, drill)
        caption(page, "Introduce a controlled timeout burst on one processor route")
        start = page.get_by_role("button", name="Start drill")
        click(page, start, 500)
        page.get_by_role("button", name="Drill complete").wait_for(timeout=45_000)
        caption(page, "The complete disruption lands atomically—no half-loaded incident")

        status = page.get_by_text("Operational change detected", exact=True)
        point_to(page, status)
        caption(page, "A portfolio-level movement is detected immediately")

        signals.scroll_into_view_if_needed()
        pause(page, 1100)
        caption(page, "The overall movement is modest, but the affected lane separates clearly")
        point_to(page, lane_movement)
        pause(page, 2100)

        impact = page.get_by_text("Change impact", exact=True)
        point_to(page, impact)
        caption(page, "Before-and-during evidence confirms the expected operating signature")

        analyst = page.get_by_text("Ask your payment data", exact=True)
        point_to(page, analyst)
        caption(page, "Continue the investigation in natural language over governed payment views")

        starter = page.get_by_role("button", name=QUESTION + " ↗")
        if starter.count() == 0:
            starter = page.get_by_role("button", name=QUESTION)
        click(page, starter, 600)
        page.get_by_role("button", name="Show generated SQL").wait_for(timeout=45_000)
        caption(page, "Aura Analyst ranks the largest deterioration and preserves inspectable evidence", 3500)
        pause(page, 1800)

        title_card(
            page,
            "Protect every payment",
            "Detect earlier · Investigate faster · Act with evidence",
            3400,
        )

        video = page.video
        context.close()
        if video is None:
            raise RuntimeError("Playwright did not create a video")
        video.save_as(str(output))
        browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3002")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/demo-video/northstar-demo.webm"),
    )
    args = parser.parse_args()
    record(args.base_url.rstrip("/"), args.output)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
