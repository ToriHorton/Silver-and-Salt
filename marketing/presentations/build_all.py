#!/usr/bin/env python3
"""Regenerate every Silver & Salt Capital deck. Run: python3 build_all.py"""
from ssc_deck import build_template, RUST_THEME, PLUM_THEME
import build_pitch_deck
import build_investor_update

if __name__ == "__main__":
    build_template(RUST_THEME, "Silver-and-Salt-Capital-Template.pptx")
    build_template(PLUM_THEME, "Silver-and-Salt-Capital-Template-Plum.pptx")
    build_pitch_deck.build()
    build_investor_update.build()
