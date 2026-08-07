#!/usr/bin/env python3
"""Plum master template (alternate colorway). See ssc_deck.py for the toolkit.

Same twelve layouts as the rust template, with plum (#8B5E83) accents and the
plum logo colorway. On dark surfaces a lighter plum (#B589AC) carries the
accent so it reads against moss.
"""
from ssc_deck import build_template, PLUM_THEME

if __name__ == "__main__":
    build_template(PLUM_THEME, "Silver-and-Salt-Capital-Template-Plum.pptx")
