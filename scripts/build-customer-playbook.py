"""Build a customer-facing copy of the 19-slide playbook deck.

Only wording changes: internal anchor/proof codes and seller language are
replaced. Slides, layout, sections, and content stay identical to the source.
"""

import re
from pathlib import Path

from pptx import Presentation

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Fintech_Aura_Analyst_Modular_Demo_Playbook_previous.pptx"
DST = ROOT / "Fintech_Aura_Analyst_Playbook_Customer.pptx"

# (slide, shape_id, paragraph) -> text, or list of run texts for multi-run paragraphs.
EDITS = {
    (1, 2, 0): "Our shared goal: make one costly decision materially faster",
    (1, 4, 0): "Start with a consequential decision, how long it takes to know today, and the cost of delay.",
    (1, 4, 1): "Agree on the observable delta you want before choosing capabilities or screens.",
    (1, 4, 2): "Balance business outcome, regulated risk, and technical feasibility from the start.",
    (1, 4, 3): "Treat every business delta as a hypothesis until your owners validate it.",
    (1, 23, 0): "Reducing time-to-know is the central promise.",
    (2, 2, 0): "A modular approach connects eight business decisions to eight reusable capabilities",
    (2, 4, 0): "BUSINESS DECISIONS",
    (2, 37, 0): "REUSABLE CAPABILITIES",
    (2, 79, 0): [
        "Each path connects:  ", "Business decision", "  →  ", "Capability",
        "  →  ", "Role value", "  →  ", "Validated delta",
    ],
    (6, 16, 3): "Provide scoped access and inspectable evidence",
    (9, 16, 3): "Apply Domain context, scoped access, and supporting evidence",
    (10, 16, 4): "Use /query for structured output; your team owns UI and actions",
    (11, 2, 0): "Your role determines the question, evidence, and stopping point",
    (11, 7, 0): "Business leaders",
    (11, 8, 0): "Prioritize growth, conversion, margin, liquidity, and decision speed.",
    (11, 10, 0): "Key capabilities: drill-down, live impact, decision views",
    (11, 15, 0): "Risk leaders",
    (11, 16, 0): "Prioritize evidence, policy context, access scope, explainability, and accountable ownership.",
    (11, 18, 0): "Key capabilities: transparency, context, scoped access",
    (11, 23, 0): "Technology leaders",
    (11, 24, 0): "Prioritize data paths, latency, concurrency, integration contracts, and operational boundaries.",
    (11, 26, 0): "Key capabilities: streaming, structured integration",
    (11, 28, 0): [
        "We focus on one primary role and up to two supporting roles.  ",
        "Domain and access views appear when they show how context and permissions shape the decision.",
    ],
    (12, 2, 0): "Eight capabilities make each decision path credible, composable, and testable",
    (13, 2, 0): "Tell–Show–Tell turns capabilities into a measurable decision story",
    (13, 10, 0): "Follow one decision path using only the capabilities needed to reach evidence.",
    (13, 14, 0): "State what changed, who acts, and which of your metrics validates value.",
    (13, 19, 0): "We remove anything that does not strengthen the decision-to-delta story. Every capability shown must move the before-and-after time gauge.",
    (15, 2, 0): "Native APIs supply intelligence while your team owns the embedded experience",
    (15, 10, 0): "Your team's experience",
    (15, 14, 0): "Embedded delivery is a joint effort: native intelligence plus your engineering, product, security, and operations.",
    (16, 2, 0): "Session formats keep one decision story while changing depth",
    (16, 7, 0): "One role, one decision, one capability, and one delta hypothesis.",
    (16, 11, 0): "One decision, two capabilities, Tell–Show–Tell, and one measurable delta.",
    (16, 15, 0): "Primary and supporting roles, one decision, three capabilities, and the native-versus-custom boundary.",
    (16, 19, 0): "Two related decisions, all three role perspectives, an API path, guardrails, and a validation plan.",
    (16, 23, 0): "Discovery-led design, architecture review, ownership mapping, delta validation, and a workshop checkpoint.",
    (16, 24, 0): "Depth and audience coverage increase from left to right; the decision story stays constant.",
    (17, 2, 0): "Recommended combinations cover common fintech priorities",
    (18, 2, 0): "Six questions turn an interesting session into a shared business case",
    (18, 8, 0): "Confirm one specific job title, not a department or broad role.",
    (18, 14, 0): "Validate the critical business issue and the problems preventing progress.",
    (18, 26, 0): "Focus only on the capabilities you consider must-have.",
    (18, 32, 0): "Quantify with your baselines, targets, and methods.",
    (18, 39, 0): "Each link must hold before we commit to next steps.",
    (19, 7, 0): "Priority decision, primary job title, decision owner, consequential question",
    (19, 19, 0): "Minimum capabilities, your success evidence, delta assumptions",
    (19, 30, 0): ["Stop  ", "and revisit later"],
}

BADGE_SLIDES = {2, 12}
CODE_PREFIXED_SLIDES = {17}

NOTES = {
    1: "• Which of your decisions grows more valuable if time-to-know falls?\n"
       "• Agree on the cost of delay before reviewing any screen.",
}


def set_paragraph(paragraph, value):
    runs = paragraph.runs
    if isinstance(value, list):
        assert len(value) == len(runs), (value, [r.text for r in runs])
        for run, text in zip(runs, value):
            run.text = text
        return
    runs[0].text = value
    for run in runs[1:]:
        run.text = ""


def strip_code(text):
    return re.sub(r"\b[AP][1-8] ", "", text)


def main():
    prs = Presentation(SRC)
    applied = set()
    for s_idx, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for p_idx, para in enumerate(shape.text_frame.paragraphs):
                if not para.runs:
                    continue
                key = (s_idx, shape.shape_id, p_idx)
                text = "".join(r.text for r in para.runs)
                if key in EDITS:
                    set_paragraph(para, EDITS[key])
                    applied.add(key)
                elif s_idx in BADGE_SLIDES and len(text) == 2 and text[0] in "AP" and text[1].isdigit():
                    set_paragraph(para, text[1])
                elif s_idx in CODE_PREFIXED_SLIDES:
                    set_paragraph(para, strip_code(text))
        if slide.has_notes_slide:
            frame = slide.notes_slide.notes_text_frame
            if s_idx in NOTES:
                frame.text = NOTES[s_idx]
            elif frame.text.startswith("• Validate the "):
                frame.text = "• To confirm together: the " + frame.text[len("• Validate the "):]

    missing = set(EDITS) - applied
    assert not missing, f"Edits not applied: {sorted(missing)}"
    prs.core_properties.title = "Aura Analyst for Fintech: Decision Playbook"
    prs.save(DST)
    print(f"Wrote {DST}")


if __name__ == "__main__":
    main()
