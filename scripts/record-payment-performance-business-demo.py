#!/usr/bin/env python3
"""Record a customer-facing payment performance story with burned-in captions."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from playwright.sync_api import Locator, Page, Response, sync_playwright


VIEWPORT = {"width": 1440, "height": 900}
QUESTION = (
    "For P2 / Mastercard / GB in the incident window, compare approval and p95 "
    "latency with its prior seven-day baseline."
)
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def pause(page: Page, milliseconds: int) -> None:
    page.wait_for_timeout(milliseconds)


def install_customer_ui(page: Page) -> None:
    page.add_style_tag(
        content="""
        nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
        html { scroll-behavior: smooth !important; }
        header a[href="/admin"], header a[href="/architecture"],
        button[title*="exit presentation" i] { display: none !important; }
        #demo-cursor {
          position: fixed; z-index: 2147483647; width: 22px; height: 22px;
          border: 3px solid white; border-radius: 50%; pointer-events: none;
          background: #0a8f69; box-shadow: 0 2px 12px rgba(4,31,25,.38);
          transform: translate(-50%, -50%);
        }
        #demo-caption {
          position: fixed; left: 38px; bottom: 34px; z-index: 2147483646;
          max-width: 780px; padding: 15px 20px; border-radius: 14px;
          color: white; background: rgba(5, 28, 23, .96);
          box-shadow: 0 12px 40px rgba(0,0,0,.28);
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
          localStorage.setItem('demo-presentation', '1');
          localStorage.setItem('demo-persona', 'business');
          localStorage.setItem('demo-analyst-chat-size', JSON.stringify({width: 700, height: 680}));
          sessionStorage.setItem('demo-analyst-mode', 'live');
          document.querySelectorAll('div.border-b').forEach((node) => {
            const label = (node.textContent || '').replace(/\\s+/g, ' ').trim();
            if (label.includes('Demo controls') || label.includes('Live payment environment')) {
              node.style.display = 'none';
            }
          });
          document.querySelectorAll('button, div').forEach((node) => {
            const label = (node.textContent || '').replace(/\\s+/g, ' ').trim();
            const title = ((node.getAttribute && node.getAttribute('title')) || '').toLowerCase();
            if (
              label === 'Exit presentation' ||
              title.includes('exit presentation') ||
              label === 'Ready to present' ||
              label === 'Needs attention'
            ) {
              node.style.display = 'none';
            }
          });
          document.querySelectorAll('h2, h3, p').forEach((node) => {
            if ((node.textContent || '').includes('Create the visible story')) {
              let card = node.parentElement;
              for (let i = 0; i < 5 && card; i += 1) {
                if ((card.textContent || '').includes('Run this story') ||
                    (card.textContent || '').includes('Story already shown')) {
                  card.style.display = 'none';
                  break;
                }
                card = card.parentElement;
              }
            }
          });
          document.querySelectorAll('a[href="/admin"], a[href="/architecture"]').forEach((node) => {
            node.style.display = 'none';
          });
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


def caption(page: Page, text: str, hold_ms: int = 3500) -> None:
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


def title_card(page: Page, title: str, subtitle: str, hold_ms: int = 3900) -> None:
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


def point_to(page: Page, locator: Locator, hold_ms: int = 750) -> None:
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


def click(page: Page, locator: Locator, hold_ms: int = 600) -> None:
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


def require_ok(response: object, action: str) -> None:
    if not getattr(response, "ok", False):
        status = getattr(response, "status", "unknown")
        raise RuntimeError(f"{action} failed with status {status}")


def reset_analyst_session(page: Page) -> None:
    result = page.evaluate(
        """async (anchor) => {
          const response = await fetch('/api/v1/analyst/session/reset', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-demo-tab-id': sessionStorage.getItem('demo-tab-id') || 'recorder'
            },
            body: JSON.stringify({anchor})
          });
          return {ok: response.ok, status: response.status};
        }""",
        "a2",
    )
    if not result["ok"]:
        raise RuntimeError(f"Analyst session reset failed with status {result['status']}")


def ask_live_analyst(page: Page, base_url: str) -> tuple[Locator, Response]:
    """Ask through the real UI and accept only a completed live-sourced turn."""
    last_error = "Aura Analyst did not return a live answer."

    for attempt in range(2):
        if attempt:
            reset_analyst_session(page)
            page.reload(wait_until="networkidle", timeout=60_000)
            page.get_by_role("heading", name="Payment Performance Management").wait_for(timeout=45_000)
            install_customer_ui(page)

        ask_analyst = page.get_by_role("button", name="Ask Analyst")
        click(page, ask_analyst, 450)
        prompt = page.get_by_role("button", name=re.compile(rf"^{re.escape(QUESTION)}(?: ↗)?$"))
        prompt.wait_for(timeout=30_000)

        with page.expect_response(
            lambda response: "/api/v1/analyst/chat" in response.url,
            timeout=30_000,
        ) as response_info:
            click(page, prompt, 350)
        response = response_info.value
        source = response.headers.get("x-analyst-source")

        if response.ok and source == "live":
            turn = page.locator("#persistent-analyst-chat article").last
            turn.get_by_text("live Analyst", exact=True).wait_for(timeout=30_000)
            turn.get_by_text(re.compile(r"^\d[\d,]* ms$")).wait_for(timeout=150_000)
            alert = turn.get_by_role("alert")
            if alert.count() == 0:
                turn.evaluate("(node) => node.scrollIntoView({block: 'start'})")
                page.screenshot(
                    path="artifacts/payment-performance-business-demo-live-analyst.png"
                )
                print(
                    "Aura verification: "
                    f"source={source}, status={response.status}, "
                    "visible_badge=live Analyst"
                )
                return turn, response
            last_error = f"Live Aura returned an answer error: {alert.inner_text()[:240]}"
        else:
            last_error = (
                "Aura response was not live: "
                f"status={response.status}, source={source or 'missing'}"
            )

        if attempt == 0:
            print(f"{last_error}; resetting the Analyst conversation and retrying once.")

    raise RuntimeError(last_error)


def record(base_url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    raw_dir = output.parent / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        launch_args: dict[str, object] = {"headless": True}
        if CHROME.exists():
            launch_args["executable_path"] = str(CHROME)
        browser = playwright.chromium.launch(**launch_args)

        # Reset before the video context so the customer recording does not include
        # a long blank wait or operator setup.
        bootstrap = playwright.request.new_context(base_url=base_url)
        try:
            reset = bootstrap.post("/api/v1/demo/reset", timeout=100_000)
            require_ok(reset, "Baseline reset")
        finally:
            bootstrap.dispose()

        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(raw_dir),
            record_video_size=VIEWPORT,
            color_scheme="light",
        )
        page = context.new_page()
        page.add_init_script(
            """() => {
              localStorage.setItem('demo-presentation', '1');
              localStorage.setItem('demo-persona', 'business');
              localStorage.setItem('demo-analyst-chat-open', '0');
              localStorage.setItem('demo-analyst-chat-size', JSON.stringify({width: 700, height: 680}));
              sessionStorage.setItem('demo-analyst-mode', 'live');
              const scrub = () => {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                  if (node.nodeValue && /\\bA2\\b/.test(node.nodeValue)) {
                    node.nodeValue = node.nodeValue.replace(/\\bA2\\b\\s*/g, '');
                  }
                }
              };
              const start = () => {
                scrub();
                new MutationObserver(scrub).observe(document.documentElement, {
                  childList: true, subtree: true, characterData: true
                });
              };
              if (document.body) start();
              else document.addEventListener('DOMContentLoaded', start);
            }"""
        )

        page.goto(f"{base_url}/anchors/a2", wait_until="networkidle", timeout=60_000)
        page.get_by_role("heading", name="Payment Performance Management").wait_for(timeout=45_000)
        install_customer_ui(page)
        title_card(
            page,
            "Payment Performance & Revenue Protection",
            "Detect authorization degradation, isolate the affected payment lane, and align the human response",
            4400,
        )
        caption(
            page,
            "This demonstration uses synthetic payment activity and contains no payment credentials.",
            3500,
        )

        hero = page.get_by_role("heading", name="Payment Performance Management")
        point_to(page, hero)
        caption(
            page,
            "Payment Performance Management gives payment leaders one view of authorization rate, response time, declines, and value at risk.",
            4100,
        )
        signals = page.get_by_role("heading", name="Key operating signals")
        point_to(page, signals)
        caption(
            page,
            "The healthy baseline makes normal approval and latency performance visible before a customer-impacting change occurs.",
            4100,
        )
        caption(
            page,
            "Why it matters: slower authorizations and more declines create checkout friction, lost conversion, and lost revenue.",
            4200,
        )

        caption(
            page,
            "Now a controlled processor timeout represents the business signal teams need to detect and investigate quickly.",
            4000,
        )
        injection = page.request.post(
            f"{base_url}/api/v1/scenarios/A2_PROCESSOR_TIMEOUT/inject",
            data={"idempotency_key": "payment-performance-business-demo"},
            timeout=45_000,
        )
        require_ok(injection, "Payment event")
        page.reload(wait_until="networkidle", timeout=60_000)
        page.get_by_text("Operational change detected", exact=True).wait_for(timeout=45_000)
        install_customer_ui(page)

        point_to(page, signals)
        caption(
            page,
            "The operating KPIs move together: approval performance falls while latency, timeout declines, and declined value rise.",
            4300,
        )
        trend = page.get_by_text("Authorization performance", exact=True)
        point_to(page, trend)
        caption(
            page,
            "The hour-wide trend is network context. The paused incident window is the decision.",
            3900,
        )
        change = page.get_by_text("Change impact", exact=True)
        point_to(page, change)
        caption(
            page,
            "Before-and-after evidence shows the affected lane moving from 96% to 88% approval as p95 latency rises from 180 to 680 milliseconds.",
            4600,
        )

        routes = page.get_by_text("Payment routes", exact=True)
        point_to(page, routes)
        affected = page.locator('a[href*="/anchors/a2/segment/P2%7CMastercard%7CGB"]').first
        point_to(page, affected)
        caption(
            page,
            "The route ranking isolates Cardinal Rails, Mastercard, United Kingdom, on the card e-commerce rail—rather than suggesting a network-wide issue.",
            4700,
        )
        click(page, affected, 700)
        page.wait_for_url("**/anchors/a2/segment/**", timeout=30_000)
        page.get_by_role("heading", name="Cardinal Rails").wait_for(timeout=45_000)
        install_customer_ui(page)

        lane_evidence = page.get_by_text("This lane against its own baseline", exact=True)
        point_to(page, lane_evidence)
        caption(
            page,
            "Lane detail confirms the approval drop, timeout increase, latency breach, and declined value against this route's own baseline.",
            4400,
        )
        attempts = page.get_by_text("Authorization attempts", exact=True)
        point_to(page, attempts)
        caption(
            page,
            "Recent synthetic attempts provide transaction-level support: response codes, merchant context, amount, and observed latency.",
            4200,
        )

        page.goto(f"{base_url}/anchors/a2", wait_until="networkidle", timeout=60_000)
        page.get_by_role("heading", name="Payment Performance Management").wait_for(timeout=45_000)
        install_customer_ui(page)
        decline_mix = page.get_by_text("Why payments declined", exact=True)
        point_to(page, decline_mix)
        caption(
            page,
            "The decline mix adds the final evidence layer: merchant category and response code show Digital Goods timeouts leading the change.",
            4300,
        )

        ask_analyst = page.get_by_role("button", name="Ask Analyst")
        point_to(page, ask_analyst, 500)
        caption(
            page,
            "A curated question asks Live Aura Analyst to compare the paused incident window with its seven-day baseline.",
            3800,
        )
        live_turn, _ = ask_live_analyst(page, base_url)
        live_badge = live_turn.get_by_text("live Analyst", exact=True)
        point_to(page, live_badge)
        caption(
            page,
            "The live Analyst badge confirms this answer was streamed from Aura Analyst—not replayed from a stored response.",
            4300,
        )
        caption(
            page,
            "Live analysis shortens the time to align payment operations and processor partners around the same evidence. People still own every routing and partner action.",
            4300,
        )

        title_card(
            page,
            "So what?",
            "Signal → affected lane and segment → supporting evidence → human-owned action",
            4400,
        )
        caption(
            page,
            "First: detect the conversion and revenue signal before a processor problem remains hidden in blended performance.",
            3900,
        )
        caption(
            page,
            "Second: isolate the processor, network, market, rail, and merchant segment responsible for the movement.",
            3900,
        )
        caption(
            page,
            "Third: use measured response-code and latency evidence to coordinate investigation and partner follow-up.",
            4000,
        )
        title_card(
            page,
            "Protect payment conversion with evidence",
            "Faster detection. Focused investigation. Clear human ownership.",
            4700,
        )

        video = page.video
        context.close()
        if video is None:
            raise RuntimeError("Playwright did not create a video")
        video.save_as(str(output))
        browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3011")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/payment-performance-business-demo-live.webm"),
    )
    args = parser.parse_args()
    record(args.base_url.rstrip("/"), args.output)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
