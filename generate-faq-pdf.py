#!/usr/bin/env python3
"""Generate Silver & Salt Capital FAQ PDF from faq-complete.md"""

import re
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── COLORS ──
MOSS = HexColor("#2F3E34")
MOSS_LIGHT = HexColor("#4A5E50")
TEAL = HexColor("#1A8F7D")
TEAL_LIGHT = HexColor("#E8F5F2")
SAGE = HexColor("#7E8E84")
CREAM = HexColor("#FBF8F2")
WHITE = HexColor("#FFFFFF")

# ── FONTS ──
# Use built-in fonts with closest match
SERIF = "Times-Roman"
SERIF_BOLD = "Times-Bold"
SERIF_ITALIC = "Times-Italic"
SERIF_BOLDITALIC = "Times-BoldItalic"
SANS = "Helvetica"
SANS_BOLD = "Helvetica-Bold"
SANS_ITALIC = "Helvetica-Oblique"

# ── STYLES ──
styles = {
    "cover_title": ParagraphStyle(
        "cover_title", fontName=SERIF, fontSize=36, leading=42,
        textColor=MOSS, alignment=TA_CENTER, spaceAfter=8
    ),
    "cover_subtitle": ParagraphStyle(
        "cover_subtitle", fontName=SANS, fontSize=13, leading=20,
        textColor=SAGE, alignment=TA_CENTER, spaceAfter=6
    ),
    "cover_tagline": ParagraphStyle(
        "cover_tagline", fontName=SERIF_ITALIC, fontSize=14, leading=20,
        textColor=TEAL, alignment=TA_CENTER, spaceAfter=40
    ),
    "toc_title": ParagraphStyle(
        "toc_title", fontName=SERIF_BOLD, fontSize=20, leading=26,
        textColor=MOSS, spaceAfter=16
    ),
    "toc_section": ParagraphStyle(
        "toc_section", fontName=SANS_BOLD, fontSize=11, leading=18,
        textColor=TEAL, spaceBefore=12, spaceAfter=4,
        leftIndent=0
    ),
    "toc_item": ParagraphStyle(
        "toc_item", fontName=SANS, fontSize=9.5, leading=15,
        textColor=MOSS_LIGHT, leftIndent=12
    ),
    "section_header": ParagraphStyle(
        "section_header", fontName=SANS_BOLD, fontSize=10, leading=14,
        textColor=TEAL, spaceBefore=0, spaceAfter=8,
        tracking=2
    ),
    "question": ParagraphStyle(
        "question", fontName=SERIF_BOLD, fontSize=14, leading=19,
        textColor=MOSS, spaceBefore=18, spaceAfter=8
    ),
    "answer": ParagraphStyle(
        "answer", fontName=SANS, fontSize=10, leading=16,
        textColor=MOSS_LIGHT, alignment=TA_JUSTIFY, spaceAfter=6
    ),
    "citation": ParagraphStyle(
        "citation", fontName=SANS_ITALIC, fontSize=8.5, leading=13,
        textColor=SAGE, spaceAfter=4, leftIndent=12,
        borderPadding=(4, 4, 4, 8),
    ),
    "legal_note": ParagraphStyle(
        "legal_note", fontName=SANS_ITALIC, fontSize=8.5, leading=13,
        textColor=TEAL, spaceAfter=4, leftIndent=12,
        backColor=TEAL_LIGHT,
        borderPadding=(8, 8, 8, 12),
    ),
    "source_title": ParagraphStyle(
        "source_title", fontName=SERIF_BOLD, fontSize=16, leading=22,
        textColor=MOSS, spaceAfter=12
    ),
    "source_item": ParagraphStyle(
        "source_item", fontName=SANS, fontSize=8.5, leading=13,
        textColor=MOSS_LIGHT, leftIndent=8, spaceAfter=3
    ),
}


def header_footer(canvas, doc):
    """Draw header and footer on each page."""
    canvas.saveState()
    w, h = letter

    # Header line
    canvas.setStrokeColor(TEAL)
    canvas.setLineWidth(0.5)
    canvas.line(54, h - 50, w - 54, h - 50)

    # Header text
    canvas.setFont(SANS, 7.5)
    canvas.setFillColor(SAGE)
    canvas.drawString(54, h - 45, "Silver & Salt Capital  —  Frequently Asked Questions")

    # Footer line
    canvas.setStrokeColor(HexColor("#E0E0E0"))
    canvas.setLineWidth(0.5)
    canvas.line(54, 52, w - 54, 52)

    # Footer text
    canvas.setFont(SANS, 7)
    canvas.setFillColor(SAGE)
    canvas.drawString(54, 40,
        "For accredited investors only. Silver & Salt Capital does not provide investment advice.")
    canvas.drawRightString(w - 54, 40, f"{doc.page}")

    canvas.restoreState()


def cover_page_footer(canvas, doc):
    """Footer only (no header) for cover page."""
    canvas.saveState()
    w, h = letter
    canvas.setFont(SANS, 7)
    canvas.setFillColor(SAGE)
    canvas.drawCentredString(w / 2, 40,
        "For accredited investors only. Silver & Salt Capital does not provide investment advice.")
    canvas.restoreState()


def parse_md(filepath):
    """Parse faq-complete.md into structured sections."""
    with open(filepath, "r") as f:
        text = f.read()

    sections = []
    current_section = None
    current_q = None
    current_answer_parts = []
    current_citation = None

    def flush_qa():
        nonlocal current_q, current_answer_parts, current_citation
        if current_q and current_section is not None:
            sections[-1]["questions"].append({
                "q": current_q,
                "parts": current_answer_parts,
            })
        current_q = None
        current_answer_parts = []
        current_citation = None

    for line in text.split("\n"):
        line_stripped = line.strip()

        # Section header
        if line_stripped.startswith("## ") and not line_stripped.startswith("## SOURCE KEY"):
            flush_qa()
            section_name = line_stripped[3:].strip()
            sections.append({"name": section_name, "questions": []})
            current_section = section_name
            continue

        if line_stripped.startswith("## SOURCE KEY"):
            flush_qa()
            sections.append({"name": "SOURCE KEY", "questions": []})
            current_section = "SOURCE KEY"
            continue

        # Skip document title and decorative lines
        if line_stripped.startswith("# ") or line_stripped == "---" or line_stripped == "":
            continue
        if line_stripped.startswith("*All Questions"):
            continue

        # Question
        if line_stripped.startswith("**") and line_stripped.endswith("**") and current_section and current_section != "SOURCE KEY":
            flush_qa()
            current_q = line_stripped.strip("*")
            continue

        # Source key items
        if current_section == "SOURCE KEY":
            if line_stripped.startswith("- "):
                current_answer_parts.append(("source", line_stripped[2:]))
            elif line_stripped.startswith("Citations") or line_stripped.startswith("Full source"):
                current_answer_parts.append(("text", line_stripped))
            continue

        # Citation / source lines
        if line_stripped.startswith("*Source:") or line_stripped.startswith("*Sources:") or line_stripped.startswith("*For reference:") or line_stripped.startswith("*Consult"):
            clean = line_stripped.strip("*")
            current_answer_parts.append(("citation", clean))
            continue

        # Legal placeholder
        if line_stripped.startswith("*[NEEDS LEGAL REVIEW"):
            clean = line_stripped.strip("*").strip("[]")
            current_answer_parts.append(("legal", clean))
            continue

        # Disclaimer
        if line_stripped.startswith("*") and line_stripped.endswith("*") and ("risk" in line_stripped.lower() or "hypothetical" in line_stripped.lower() or "past performance" in line_stripped.lower()):
            clean = line_stripped.strip("*")
            current_answer_parts.append(("citation", clean))
            continue

        # Regular answer paragraph
        if current_q is not None and line_stripped:
            # Clean up markdown formatting
            clean = line_stripped.replace("*", "")
            current_answer_parts.append(("text", clean))

    flush_qa()
    return sections


def build_pdf(sections, output_path):
    """Build the PDF document."""
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        topMargin=0.85 * inch,
        bottomMargin=0.85 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        title="Silver & Salt Capital — Frequently Asked Questions",
        author="Silver & Salt Capital",
    )

    story = []

    # ── COVER PAGE ──
    story.append(Spacer(1, 1.8 * inch))

    # Teal rule
    story.append(HRFlowable(
        width="40%", thickness=2, color=TEAL,
        spaceAfter=20, spaceBefore=0, hAlign="CENTER"
    ))

    story.append(Paragraph("Silver &amp; Salt Capital", styles["cover_title"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Frequently Asked Questions", ParagraphStyle(
        "cover_faq", fontName=SERIF_ITALIC, fontSize=22, leading=28,
        textColor=TEAL, alignment=TA_CENTER, spaceAfter=20
    )))

    story.append(HRFlowable(
        width="40%", thickness=1, color=SAGE,
        spaceAfter=24, spaceBefore=0, hAlign="CENTER"
    ))

    story.append(Paragraph(
        "Everything you need to know about our collective model,<br/>"
        "commitment structure, and what it means to invest together.",
        styles["cover_subtitle"]
    ))

    story.append(Spacer(1, 24))
    story.append(Paragraph(
        "Connecting capital to Utah founders who use it best.",
        styles["cover_tagline"]
    ))

    story.append(Spacer(1, 1.2 * inch))

    # Cover stats
    stats_data = [
        ["55", "6", "20+"],
        ["Questions", "Categories", "Sources Cited"],
    ]
    stats_table = Table(stats_data, colWidths=[2 * inch, 2 * inch, 2 * inch])
    stats_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), SERIF_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 32),
        ("TEXTCOLOR", (0, 0), (-1, 0), TEAL),
        ("FONTNAME", (0, 1), (-1, 1), SANS),
        ("FONTSIZE", (0, 1), (-1, 1), 9),
        ("TEXTCOLOR", (0, 1), (-1, 1), SAGE),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
    ]))
    story.append(stats_table)

    story.append(PageBreak())

    # ── TABLE OF CONTENTS ──
    story.append(Paragraph("Table of Contents", styles["toc_title"]))
    story.append(HRFlowable(
        width="100%", thickness=1, color=TEAL,
        spaceAfter=12, spaceBefore=0
    ))

    for section in sections:
        if section["name"] == "SOURCE KEY":
            story.append(Paragraph(
                f'<a href="#{_anchor(section["name"])}" color="#1A8F7D">Source Key</a>',
                styles["toc_section"]
            ))
            continue

        story.append(Paragraph(
            f'<a href="#{_anchor(section["name"])}" color="#1A8F7D">{section["name"]}</a>',
            styles["toc_section"]
        ))
        for qa in section["questions"]:
            q_text = qa["q"].replace("&", "&amp;")
            story.append(Paragraph(
                f'<a href="#{_anchor(qa["q"])}" color="#4A5E50">{q_text}</a>',
                styles["toc_item"]
            ))

    story.append(PageBreak())

    # ── CONTENT SECTIONS ──
    for section in sections:
        if section["name"] == "SOURCE KEY":
            # Source key section
            story.append(Spacer(1, 8))
            story.append(HRFlowable(
                width="100%", thickness=2, color=TEAL,
                spaceAfter=8, spaceBefore=0
            ))

            anchor = f'<a name="{_anchor(section["name"])}"/>'
            story.append(Paragraph(
                f'{anchor}SOURCE KEY',
                styles["section_header"]
            ))

            # Intro text from source key
            intro_parts = [p for p in section["questions"] if not section["questions"]]
            for part_type, part_text in (section["questions"][0]["parts"] if section["questions"] else []):
                clean = part_text.replace("&", "&amp;")
                if part_type == "source":
                    story.append(Paragraph(f"• {clean}", styles["source_item"]))
                elif part_type == "text":
                    story.append(Paragraph(clean, styles["answer"]))

            # If no questions wrapper, just dump answer_parts from parse
            if not section["questions"]:
                pass

            story.append(Spacer(1, 12))
            continue

        # Section header
        story.append(Spacer(1, 8))
        story.append(HRFlowable(
            width="100%", thickness=2, color=TEAL,
            spaceAfter=8, spaceBefore=0
        ))

        anchor = f'<a name="{_anchor(section["name"])}"/>'
        story.append(Paragraph(
            f'{anchor}{section["name"].upper()}',
            styles["section_header"]
        ))

        # Questions
        for qa in section["questions"]:
            q_text = qa["q"].replace("&", "&amp;")
            q_anchor = f'<a name="{_anchor(qa["q"])}"/>'

            elements = []
            elements.append(Paragraph(f'{q_anchor}{q_text}', styles["question"]))

            for part_type, part_text in qa["parts"]:
                clean = part_text.replace("&", "&amp;")

                if part_type == "text":
                    # Bold inline formatting
                    clean = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', clean)
                    elements.append(Paragraph(clean, styles["answer"]))

                elif part_type == "citation":
                    elements.append(Paragraph(clean, styles["citation"]))

                elif part_type == "legal":
                    elements.append(Paragraph(clean, styles["legal_note"]))

                elif part_type == "source":
                    elements.append(Paragraph(f"• {clean}", styles["source_item"]))

            elements.append(Spacer(1, 6))
            elements.append(HRFlowable(
                width="100%", thickness=0.5, color=HexColor("#E8E8E8"),
                spaceAfter=4, spaceBefore=0
            ))

            story.append(KeepTogether(elements[:3]))  # Keep Q + first 2 answer paras together
            for el in elements[3:]:
                story.append(el)

    # ── FINAL FOOTER ──
    story.append(Spacer(1, 40))
    story.append(HRFlowable(
        width="100%", thickness=1, color=TEAL,
        spaceAfter=16, spaceBefore=0
    ))
    story.append(Paragraph(
        "Silver &amp; Salt Capital  •  Utah  •  silverandsaltcapital.com",
        ParagraphStyle("final", fontName=SANS, fontSize=9, textColor=SAGE, alignment=TA_CENTER)
    ))
    story.append(Paragraph(
        "Connecting capital to Utah founders who use it best.",
        ParagraphStyle("final_tag", fontName=SERIF_ITALIC, fontSize=11,
                       textColor=TEAL, alignment=TA_CENTER, spaceBefore=6)
    ))

    doc.build(story, onFirstPage=cover_page_footer, onLaterPages=header_footer)
    print(f"PDF generated: {output_path}")


def _anchor(text):
    """Create a clean anchor ID from text."""
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:60]


if __name__ == "__main__":
    import os
    base = "/Users/tori_horton/Projects/Silver-and-Salt"
    md_path = os.path.join(base, "faq-complete.md")
    pdf_path = os.path.join(base, "Silver-and-Salt-Capital-FAQ.pdf")

    # The source key in the MD is not wrapped in a question, handle specially
    sections = parse_md(md_path)

    # Handle source key section — it has items in answer_parts but no "question" wrapper
    # Let's create a dummy question for it
    source_section = None
    for s in sections:
        if s["name"] == "SOURCE KEY":
            source_section = s
            break

    if source_section and not source_section["questions"]:
        # Re-parse source key manually
        with open(md_path, "r") as f:
            text = f.read()
        sk_match = text.find("## SOURCE KEY")
        if sk_match >= 0:
            sk_text = text[sk_match:]
            parts = []
            for line in sk_text.split("\n"):
                line = line.strip()
                if line.startswith("## "):
                    continue
                if line.startswith("- "):
                    parts.append(("source", line[2:]))
                elif line and not line.startswith("---"):
                    parts.append(("text", line))
            source_section["questions"] = [{"q": "Sources", "parts": parts}]

    build_pdf(sections, pdf_path)
