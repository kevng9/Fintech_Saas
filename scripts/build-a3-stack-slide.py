"""Build the one-slide "fraud stack today vs. one query" opener for the A3 deep dive.

Writes Fintech_A3_Stack_Slide.pptx with the customer deck's template and
styling, so the slide can be inserted into the customer deck as is.
"""

import importlib.util
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR
from pptx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Fintech_Aura_Analyst_Playbook_Customer.pptx"
DEST = ROOT / "Fintech_A3_Stack_Slide.pptx"

_spec = importlib.util.spec_from_file_location("styled", Path(__file__).with_name("build-customer-playbook-styled.py"))
styled = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(styled)

STACK = [
    ("Case-management database", "Cases, outcomes, and investigator notes"),
    ("Document store", "Alert details and the reasons each alert fired"),
    ("Vector database", "Search for similar past cases"),
    ("Time-series database", "Velocity: how many attempts per device or card, minute by minute"),
    ("Data warehouse", "Loss and false-positive reports, loaded overnight"),
    ("Pipelines between them", "Copies that run hourly or nightly"),
]

JOBS = [
    (RGBColor(0x7C, 0x3A, 0xED), "Vector search", "instead of a vector database"),
    (RGBColor(0xB4, 0x53, 0x09), "JSON documents", "instead of a document store"),
    (RGBColor(0x0E, 0x74, 0x90), "Time series", "instead of a time-series database"),
    (RGBColor(0x1D, 0x4E, 0xD8), "Relational joins", "instead of an operational database"),
    (RGBColor(0x04, 0x78, 0x57), "Aggregation", "instead of a data warehouse"),
    (RGBColor(0xBE, 0x12, 0x3C), "Live data", "instead of nightly copies"),
]

NOTES = (
    "Use this before the A3 demo as a discovery question. Ask: which of these does your team run "
    "today, and how old is the data by the time an investigator sees it? Let them correct the "
    "picture; it is a typical stack, not theirs. Then say: in the demo, one SQL statement does all "
    "six jobs on live data, and we will show you which part of the query does which job."
)


def build(prs):
    slide = styled.light(prs, "Fraud evidence usually lives in six systems. Here it is one query.", 24)

    styled.label(slide, 0.64, 1.60, 6.0, "A TYPICAL FRAUD STACK TODAY")
    for i, (system, holds) in enumerate(STACK):
        y = 1.92 + i * 0.66
        styled.add_rect(slide, 0.64, y, 6.0, 0.58, styled.MIST)
        styled.add_text(slide, 0.84, y + 0.05, 5.6, 0.26, system, "Roboto Medium", 13, styled.INK)
        styled.add_text(slide, 0.84, y + 0.31, 5.6, 0.24, holds, "Roboto", 11, styled.GRAY)

    styled.label(slide, 7.15, 1.60, 5.5, "THE SAME WORK IN ONE SINGLESTORE QUERY")
    for i, (color, job, instead) in enumerate(JOBS):
        y = 1.92 + i * 0.66
        styled.add_rect(slide, 7.15, y, 0.10, 0.58, color)
        styled.add_text(slide, 7.45, y + 0.05, 5.2, 0.26, job, "Roboto Medium", 13, color)
        styled.add_text(slide, 7.45, y + 0.31, 5.2, 0.24, instead, "Roboto", 11, styled.GRAY)

    styled.add_rect(slide, 0.64, 5.95, 12.05, 0.80, styled.DEEP)
    styled.add_text(
        slide, 0.88, 5.95, 11.6, 0.80,
        "Which of these does your team run today, and how old is the data by the time an investigator sees it?",
        "Roboto Medium", 15, styled.WHITE, anchor=MSO_ANCHOR.MIDDLE,
    )
    slide.notes_slide.notes_text_frame.text = NOTES
    return slide


def main():
    prs = Presentation(SOURCE)
    slide_ids = prs.slides._sldIdLst
    for slide_id in list(slide_ids):
        prs.part.drop_rel(slide_id.get(qn("r:id")))
        slide_ids.remove(slide_id)
    build(prs)
    prs.save(DEST)
    print(f"Wrote {DEST}")


if __name__ == "__main__":
    main()
