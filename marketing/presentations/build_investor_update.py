#!/usr/bin/env python3
"""
Pre-filled investor update (rust colorway) for Silver & Salt Capital.

A worked quarterly-update example built from the ssc_deck toolkit. Figures are
illustrative placeholders; replace them with your real numbers. Copy follows
the brand rules exactly.

Run:  python3 build_investor_update.py
"""
from pptx.util import Inches
import ssc_deck as d

T = 8


def build():
    prs = d.new_deck()

    d.cover(prs, d.RUST_THEME, title="Investor Update",
            subtitle="A note on the quarter: what we backed, and what comes "
            "next.",
            eyebrow_text="For Members", date_text="Q3 2026")

    d.content(prs, d.RUST_THEME, eyebrow_text="From Tori",
              heading="Where we are",
              body=[
                  "This quarter we reviewed more founders than any before, "
                  "and made our most deliberate investments yet.",
                  "The thesis is holding. Utah's founders are here, they are "
                  "strong, and they are ready for capital that moves with "
                  "conviction.",
                  "Thank you for building this with us. Here is the quarter "
                  "in full.",
              ],
              callout="A steady quarter, with real momentum underneath it.",
              page=2, total=T)

    s = d.stats(prs, d.RUST_THEME, eyebrow_text="The Quarter",
                heading="By the numbers", items=[
                    {"num": "24", "label": "Founders reviewed"},
                    {"num": "6", "label": "New investments made",
                     "accent": d.MOSS},
                    {"num": "118", "label": "Members in the collective"},
                ], page=3, total=T)
    d.textbox(s, d.MARGIN, Inches(6.35), Inches(8), Inches(0.4),
              [{"text": "Illustrative figures. Replace with the quarter's "
                "actuals.", "font": d.SANS, "size": 12, "color": d.SAGE,
                "tracking": 0.4}])

    d.cards_grid(prs, d.RUST_THEME, eyebrow_text="New This Quarter",
                 heading="Where the capital went", cards=[
                     {"num": "01", "head": "Company One",
                      "body": "Sector. One line on what they do and why we "
                      "backed them."},
                     {"num": "02", "head": "Company Two",
                      "body": "Sector. One line on what they do and why we "
                      "backed them."},
                     {"num": "03", "head": "Company Three",
                      "body": "Sector. One line on what they do and why we "
                      "backed them."},
                 ], page=4, total=T)

    d.two_column(prs, d.RUST_THEME, eyebrow_text="Portfolio",
                 heading="Highlights and where we're leaning in", columns=[
                     {"head": "Highlights",
                      "body": "A portfolio company hit a milestone. Note the "
                      "traction, the raise, or the hire that matters most."},
                     {"head": "Leaning in",
                      "body": "The sectors and stages drawing our conviction "
                      "next quarter. Keep it to two or three."},
                 ], page=5, total=T)

    d.content(prs, d.RUST_THEME, eyebrow_text="Community",
              heading="More than capital",
              body=[
                  "We hosted member dinners in Salt Lake and Provo, and "
                  "welcomed new investors to the collective.",
                  "Every gathering deepens the network that founders draw on "
                  "when they take our capital.",
              ],
              callout="Capital, and a network founders can draw on.",
              page=6, total=T)

    d.content(prs, d.RUST_THEME, eyebrow_text="Looking Ahead",
              heading="What's next",
              body=[
                  "Close the two investments already in diligence.",
                  "Grow the collective toward our first hundred members.",
                  "Publish our first open research note on Utah's funding "
                  "gap.",
              ], page=7, total=T)

    d.closing(prs, d.RUST_THEME,
              line1="Thank you for building Silver & Salt Capital with us.",
              line2="Onward, together.",
              cta="Reach out anytime")

    d.save(prs, "Silver-and-Salt-Capital-Investor-Update.pptx")


if __name__ == "__main__":
    build()
