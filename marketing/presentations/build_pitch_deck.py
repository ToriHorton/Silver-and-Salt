#!/usr/bin/env python3
"""
Pre-filled pitch deck (rust colorway) for Silver & Salt Capital.

A worked example built from the ssc_deck toolkit: real brand voice, real
structure (the thesis-page section order), ready to tailor. Copy follows the
brand rules exactly (full name with the ampersand, no em or en dashes, define
by what things are).

Run:  python3 build_pitch_deck.py
"""
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
import ssc_deck as d

T = 11


def paradox_slide(prs, theme):
    """Custom two-number Utah Paradox slide with the approved reframe line."""
    s = d.add_slide(prs, d.SAND)
    d.watermark(s, d.WM_ON_SAND, x=Inches(10.4))
    d.eyebrow(s, "The Utah Paradox", d.MARGIN, Inches(0.95), theme.accent)
    d.textbox(s, d.MARGIN, Inches(1.35), Inches(11), Inches(1.0),
              [{"text": "Two rankings, one opportunity", "font": d.SERIF,
                "size": 44, "color": d.MOSS, "tracking": -0.4}])
    pairs = [("#3", "In the United States, Utah's rank to start a business",
              theme.accent),
             ("#50", "Utah's rank for women's equality", d.MOSS)]
    for i, (num, label, accent) in enumerate(pairs):
        x = d.MARGIN + Inches(5.0) * i
        d.textbox(s, x, Inches(2.85), Inches(4.6), Inches(1.7),
                  [{"text": num, "font": d.NUMERAL, "size": 120,
                    "color": accent, "tracking": -2, "line_spacing": 0.95}])
        d.rule(s, x + Inches(0.08), Inches(4.7), Inches(0.6), Pt(2), accent)
        d.textbox(s, x, Inches(4.9), Inches(4.4), Inches(1.0),
                  [{"text": label, "font": d.SANS, "size": 16,
                    "color": d.MOSS_LIGHT, "line_spacing": 1.4}])
    d.textbox(s, d.MARGIN, Inches(6.05), Inches(11.4), Inches(1.1),
              [{"text": "The gap between being a great place to start a "
                "business and being challenging for women's equality is "
                "exactly what makes the opportunity so exciting.",
                "font": d.SERIF, "size": 22, "color": d.MOSS, "italic": True,
                "line_spacing": 1.2}])
    return s


def build():
    prs = d.new_deck()

    d.cover(prs, d.RUST_THEME, title="Silver & Salt Capital",
            subtitle="A collective of accredited women investors backing "
            "Utah's best founders.",
            eyebrow_text="Investor Briefing", date_text="Month 2026")

    d.agenda(prs, d.RUST_THEME, heading="What we'll cover", items=[
        ("01", "The opportunity", "Utah's founders, underfunded."),
        ("02", "The thesis", "Small bets, high conviction."),
        ("03", "The model", "How the collective works."),
        ("04", "The evidence", "What the data shows."),
        ("05", "Join us", "The first hundred members."),
    ], page=2, total=T)

    d.section_divider(prs, d.RUST_THEME, number="01",
                      title="The Opportunity",
                      subtitle="Utah's high-performing founders are "
                      "underfunded.")

    paradox_slide(prs, d.RUST_THEME)

    d.content(prs, d.RUST_THEME, eyebrow_text="The Landscape",
              heading="Not new. Just new to Utah.",
              body=[
                  "Women-led angel collectives have backed founders across "
                  "the country for years. Boston, New York, the Bay Area.",
                  "Silver & Salt Capital brings that proven model home to "
                  "Utah, where the founders are already here and the capital "
                  "has been slow to follow.",
              ],
              callout="A proven model, an open market, and a founder base "
              "already in place.", page=5, total=T)

    d.section_divider(prs, d.RUST_THEME, number="02", title="The Model",
                      subtitle="Small bets, shared conviction.")

    d.cards_grid(prs, d.RUST_THEME, eyebrow_text="The Model",
                 heading="How the collective works", cards=[
                     {"num": "01", "head": "A collective",
                      "body": "Accredited women investors pooling capital and "
                      "judgment to back founders together."},
                     {"num": "02", "head": "Small bets",
                      "body": "Many measured investments across a portfolio, "
                      "rather than a few large ones."},
                     {"num": "03", "head": "Shared conviction",
                      "body": "Members set the thesis, source deals, and "
                      "decide together."},
                 ], page=7, total=T)

    d.content(prs, d.RUST_THEME, eyebrow_text="The Thesis",
              heading="The science of small bets",
              body=[
                  "Early-stage returns follow a power law. A few investments "
                  "carry the portfolio.",
                  "So we spread conviction across many founders and let the "
                  "winners compound. Diversification is the strategy.",
              ],
              callout="A portfolio of small bets beats a single large one.",
              callout_source="Portfolio math", page=8, total=T)

    s = d.stats(prs, d.RUST_THEME, eyebrow_text="The Data",
                heading="Don't take our word for it", items=[
                    {"num": "78¢", "label": "Revenue per dollar invested in "
                     "women-founded companies"},
                    {"num": "31¢", "label": "Revenue per dollar invested in "
                     "the average company", "accent": d.MOSS},
                    {"num": "2×", "label": "Comparable outcomes on roughly "
                     "half the capital"},
                ], page=9, total=T)
    d.textbox(s, d.MARGIN, Inches(6.35), Inches(8), Inches(0.4),
              [{"text": "Source: BCG / MassChallenge", "font": d.SANS,
                "size": 12, "color": d.SAGE, "tracking": 0.6}])

    d.pull_quote(prs, d.RUST_THEME,
                 quote="The first hundred members will set the thesis, shape "
                 "the culture, and define what comes next.",
                 attribution="The founding invitation")

    d.closing(prs, d.RUST_THEME,
              line1="Utah's next generation of innovation will be shaped by "
              "founders & determined by funders.",
              line2="It's time more of them are women.")

    d.save(prs, "Silver-and-Salt-Capital-Pitch-Deck.pptx")


if __name__ == "__main__":
    build()
