# Silver & Salt Capital — Presentation System

A set of on-brand decks for Google Slides, built in Slides' native format. Every
color, font, and layout follows
[`_reference/brand-standards.md`](../../_reference/brand-standards.md) and
[`BRAND.md`](../../BRAND.md).

### Files in this folder

| File | What it is |
|------|-----------|
| `Silver-and-Salt-Capital-Template.pptx` | **Master template, rust colorway** (the default). 12 ready-to-duplicate layouts. |
| `Silver-and-Salt-Capital-Template-Plum.pptx` | **Master template, plum colorway.** Same 12 layouts, plum accents and plum logo. |
| `Silver-and-Salt-Capital-Pitch-Deck.pptx` | **Pre-filled example:** an 11-slide investor/member pitch, ready to tailor. |
| `Silver-and-Salt-Capital-Investor-Update.pptx` | **Pre-filled example:** an 8-slide quarterly update. Figures are illustrative; swap in your own. |

Start from a **template** for a new deck; start from an **example** to edit real
copy. Rust is the default (Home / About palette); use plum when you want the
"How It Works" feel or simply an alternate look.

---

## How to use it in Google Slides

1. Go to [drive.google.com](https://drive.google.com) and click **New > File upload**, then choose any of the `.pptx` files above.
2. Right-click the uploaded file in Drive and choose **Open with > Google Slides**.
3. **File > Save as Google Slides.** This converts it to a fully editable native Slides deck. Everything stays editable: text, color, position, images.
4. **File > Make a copy** whenever you start a new presentation, so the master stays clean.

To build a deck, duplicate the layout slide you need (right-click in the slide
strip > **Duplicate slide**), then drag it into order and replace the text.

### One-time font setup (do this once per Google account)

The template uses three fonts. Add them so the deck renders as designed:

1. In any Google Slides deck, open the font dropdown and click **More fonts**.
2. Search for and add each of:
   - **Cormorant Garamond** — display, headings, quotes, the wordmark
   - **Cormorant Infant** — numerals only (its "1" has a flag, so figures never misread)
   - **Hanken Grotesk** — body, labels, and UI

Once added, they appear in the font menu for every deck on that account.

> **Why Hanken Grotesk?** The brand body font is **Satoshi**, which is not
> available in Google Slides. Hanken Grotesk is the closest free substitute in
> the Google Fonts library. If your audience views the deck somewhere Satoshi is
> installed, you may swap it back; otherwise Hanken Grotesk keeps the look
> consistent for everyone.

---

## What's in the deck

| # | Layout | Use it for |
|---|--------|-----------|
| 01 | Cover / title | Opening slide |
| 02 | Agenda / contents | What you'll cover |
| 03 | Section divider (rust) | Chapter breaks |
| 04 | Standard content | Heading, body, side callout |
| 05 | Two column | Side-by-side ideas |
| 06 | Statement numbers | Stats and data points |
| 07 | Pull quote | A single strong quote |
| 08 | Image + caption | Photo-led storytelling |
| 09 | Three card grid | Three parallel items |
| 10 | Section divider (moss) | Alternate chapter break |
| 11 | Closing / contact | Final slide, call to action |
| 12 | Appendix: palette & type | In-deck brand reference |

---

## Brand reminders when you edit

These are enforced in the template; keep them when you replace the copy:

- **Full name, every time: "Silver & Salt Capital."** Always the `&` character, never the word "and," never "Silver & Salt" alone.
- **No em dashes or en dashes.** Use commas, periods, colons, parentheses, or semicolons. A line that wants a dash usually wants to be two sentences.
- **Define by what something IS,** never by what it isn't.
- **Numerals carry their own font (Cormorant Infant).** When you type figures into a serif heading, set that text box's font to Cormorant Infant so the "1" stays flagged.
- The ampersand watermark is a whisper, never a shout. Leave it subtle.

---

## Regenerating the decks

Every `.pptx` is generated from Python (requires `python-pptx`). The shared
toolkit lives in `ssc_deck.py`; each deck is a thin build script.

```bash
pip install python-pptx
python3 build_all.py          # rebuilds all four decks
```

Or build one at a time:

```bash
python3 build_template.py         # rust master template
python3 build_template_plum.py    # plum master template
python3 build_pitch_deck.py       # pitch example
python3 build_investor_update.py  # investor-update example
```

**How a new colorway works.** `ssc_deck.py` defines a `Theme` (accent, on-dark
accent, divider colors, and logo set). `RUST_THEME` and `PLUM_THEME` are the two
provided. To add another (say the teal Opportunity palette), copy `PLUM_THEME`,
swap the hexes and logo paths, and call `build_template(YOUR_THEME, "...")`.

Logo art is pulled from `../logos/brand-assets/`. On dark slides the on-dark
light logo (sage/plum left, accent right, cream wordmark) is used, per the
preferred on-dark treatment in the brand standards. The dark-wordmark secondary
logo is never placed on a dark surface, where it would disappear.
