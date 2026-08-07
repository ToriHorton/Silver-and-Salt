# How It Works + Membership: content plan

**Status:** working draft, 2026-08-03. Nothing here is live.
**Purpose:** settle what content exists, what conflicts, and what is missing, so the
one-page or two-page decision is made against real blocks instead of guesses.

**Files in play**

| File | State | Note |
|---|---|---|
| `index.html` `#page-how` | live | How It Works, a tab panel inside a 318KB single-page file |
| `membership.html` | never committed, not in live nav | the current Membership page, reverted to its original |
| `membership-draft.html` | new | our working draft: sorter plus three memberships spliced in |
| `membership-signup-section.html` | new | the sorter and cards in isolation, for detail edits |
| `membership-g6.html` and 10 siblings | new | hero treatments, undecided |

-----

## 1. The blocks that exist today

### From How It Works (`#page-how`)

| # | Block | Keep? | Note |
|---|---|---|---|
| H1 | Hero: "We learn together. We vet together. You invest deal by deal." | keep | still true under three memberships |
| H2 | Three pillars: we vet together / you invest on your terms / simple, powerful, yours | keep | |
| H3 | **How the Money Works**: community and investing kept separate | keep, **edit** | says "$1,000 a year funds the movement" |
| H4 | "Silver & Salt Capital is not a fund" | keep | the single clearest trust line on the site |
| H5 | Five steps: Join, Discover, Decide, Invest, Champion | keep, **edit** | step 1 assumes one membership |
| H6 | Capital-at-each-step strip | keep | |
| H7 | Angel Investing 101 accordion (6 questions) | keep | the deepest asset either page has |
| H8 | Risk disclaimer | keep | counsel gate |

### From the current Membership page (`membership.html`)

| # | Block | Keep? | Note |
|---|---|---|---|
| M1 | Hero, moss, ampersand watermark | keep | |
| M2 | Stat strip, four figures | keep | |
| M3 | Four benefit sections, numbered | keep, **edit** | written for a single $1,000 membership |
| M4 | FAQ, 6 questions | keep, **edit** | "What does my $1,000 actually pay for?" |
| M5 | Price section, $1,000 + founding discount + January urgency | **replaced** | by the three cards |
| M6 | Stewardship, $10,000, five seats | **retired** | superseded: $5,000, no seat limit |
| M7 | Guest note and money-separation note | keep | duplicates H3, pick one home |
| M8 | Founder note from Tori | keep | |
| M9 | Who's in the room grid | keep | |
| M10 | Closing CTA + three-yeses panel | keep | |

### New, built this session

| # | Block | Note |
|---|---|---|
| N1 | **The sorter**: one question, four statements, radio cards, mobile first | statements 3 and 4 both route to Associate |
| N2 | **Three memberships**: Community Steward $5,000 / Founding $1,000 / Associate free | |
| N3 | **Continue bar**, thumb zone, appears on selection | |
| N4 | Coaching-hours detail block on the Steward card | |

-----

## 2. Conflicts to resolve before either arrangement ships

1. **"$1,000 a year funds the movement"** appears in How It Works, the membership meta
   description, the FAQ, and the old sticky bar. Three memberships now exist.
2. **"Open to women in Utah"** is stated as a blanket rule. True for Founding and
   Steward. Associate is open to everyone, anywhere.
3. **Steward benefits dropped** when the $10,000 section retired, and are currently
   promised nowhere: a private conversation with Tori each quarter, name in the annual
   receipt, a voice in next year's programming, four guest seats at every Pitch Party.
4. **The founding discount is missing.** "First 100 founding members receive 10 percent
   off for as long as you stay" is not on the new Founding card.
5. **Eligibility and urgency copy is homeless.** "The January cohort holds 25 seats,
   first come, first served. Accreditation is never part of the application."
6. **CTA wording deviates from brand standard.** Standard says every primary CTA reads
   "Join Us". The cards read "Fund the movement", "Join the action", "See the deals".
7. **The free tier needs a counsel pass.** Associate promises "qualify for the option to
   invest" to anyone, anywhere, which touches the same 506(b) question as guests at
   Pitch Parties.
8. **Statement 3 routes the most investment-ready visitor to the free tier.** Deliberate
   or not, decide it on purpose.

-----

## 3. Arrangement A: one page

`membership.html` becomes the whole story, top to bottom.

```
M1  Hero
M2  Stat strip
H1  We learn together, we vet together, you invest deal by deal
H2  Three pillars
H4  Not a fund
H5  Five steps
H6  Capital strip
M3  The four benefits
H3  How the money works: community and investing, separate
N1  THE SORTER
N2  THE THREE MEMBERSHIPS
N3  Continue bar
M4  FAQ
H7  Angel Investing 101
M8  Founder note
M9  Who's in the room
M10 Close
H8  Risk disclaimer
```

**For:** one URL, one scroll, no navigation decision at the moment of highest intent.
The sorter arrives after she understands the model, which is exactly when a question
about readiness can be answered honestly.

**Against:** very long, roughly twice the current membership page. The offer and the
deal mechanics live on the same public page, which is the thing the 506(b) working
rules ask us to keep apart. Nav has two tabs pointing at overlapping content.

-----

## 4. Arrangement B: two pages

**How It Works** explains the machine to everyone, including accredited investors.

```
H1  Hero
H2  Three pillars
H4  Not a fund
H3  How the money works: community and investing, separate   [edit for three tiers]
H5  Five steps                                               [edit step 1]
H6  Capital strip
H7  Angel Investing 101
H8  Risk disclaimer
→   handoff: the sorter's question as a link, not the sorter itself
```

**Membership** sells, and is the only page that asks for money.

```
M1  Hero
M2  Stat strip
M3  The four benefits          [edit for three tiers]
N1  THE SORTER
N2  THE THREE MEMBERSHIPS
N3  Continue bar
M4  FAQ                        [edit]
M7  Guest + money note         [short version, links to How It Works]
M8  Founder note
M9  Who's in the room
M10 Close
```

**For:** keeps the offer off the explainer page, which is what the working rules ask.
Each page is a readable length. Membership can be linked directly from a campaign
without the mechanics. Matches the nav that already exists.

**Against:** she has to click once between understanding and choosing. The money
separation gets explained twice, in different words, unless one page owns it.

-----

## 5. What is true either way

- The sorter and the three memberships stay together as one unit. The sorter's whole
  job is to highlight a card, so they cannot be separated across pages.
- The money separation (H3) needs exactly one home. Whichever page owns it, the other
  links to it.
- Angel Investing 101 belongs with How It Works, not with the offer.
- Every conflict in section 2 has to be resolved before either arrangement ships.

-----

## 6. Open decisions

1. One page or two.
2. Whether How It Works stays a tab inside `index.html` or becomes its own file.
3. Where the four dropped Steward benefits go.
4. Where the founding discount and January urgency copy live.
5. Whether the card CTAs stay off brand standard.
