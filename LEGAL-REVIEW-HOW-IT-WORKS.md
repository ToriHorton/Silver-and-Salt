# Legal review worklist: how-c.html (dev How It Works)

Not legal advice. A working list for Tori to resolve, then hand the survivors to
securities counsel. Scope is `how-c.html` only. Several items also exist on live
pages (`index.html`, `faqs.html`); those are noted but out of scope here.

Status key: OPEN / DECIDED / COUNSEL

| # | Line | Concern | Status |
|---|---|---|---|
| Q1 | 694 | "members must be accredited investors" contradicts the free tier | DECIDED |
| Q2 | 656 | "Membership is never required to invest" vs the gate box | DECIDED |
| Q3 | 669 | "Every investor here is a member" wording | DECIDED |
| Q4 | 535 | "free access to our deal flow" in the hero | COUNSEL |
| Q5 | 658 | "The SEC asks that we know each other" | DECIDED |
| Q6 | 658 | "open to you at every membership level, including the free one" | DECIDED |
| Q7 | 587 | "never adjusted for inflation" is factually wrong | DECIDED |
| Q8 | 666 | income test missing the current-year expectation prong | DECIDED |
| Q9 | 666 | "assets outside their home" should be net worth | DECIDED |
| Q10 | 728 | "top-quartile IRRs of 20–30%" | DECIDED |
| Q11 | 729 | "$10K+/year over five years, 30+ companies" | DECIDED (keep) |
| Q12 | 730 | risk disclaimer buried in a collapsed accordion | DECIDED |
| Q13 | 548 | "profitable women-owned Utah businesses" | DECIDED |
| Q14 | 570 | "Utah's first women's angel network" superlative | DECIDED |
| Q15 | 587 | 120,000 conflicts with 100,000 elsewhere on the site | DECIDED |
| Q16 | figure | 100 investors per SPV sits at the 3(c)(1) ceiling | COUNSEL |
| Q17 | — | no "not a broker-dealer or investment adviser" statement | DECIDED |

Decisions get recorded inline under each question as they are made.

---

## Q1 — DECIDED (Tori, 2026-08-10)

Replaced "Silver & Salt Capital members must be accredited investors." with
"Only accredited investors have the option to invest." Applied in how-c.html.

**Still open elsewhere:** the original sentence is live on faqs.html:746.

## Q2 — DECIDED (Tori, 2026-08-10)

"Membership and investing are separate. Paid membership is never required to
invest, and accredited investors are never required to invest."

Adding "Paid" resolves the contradiction with the gate box (Q3): a free
Associate is still a member, so "every investor here is a member" holds.

## Q3 — DECIDED (Tori, 2026-08-10)

Gate box now reads: "We only share access to investment deals with our members.
Membership is free, if you want it to be."

**Counsel note:** this states MEMBERSHIP as the gate. Rule 506(b) turns on a
pre-existing SUBSTANTIVE relationship, not membership status. The relationship
is still built (membership starts with a conversation, stated in the paragraph
above), but no single sentence now says so. Ask counsel whether the gate
sentence should name the conversation.

## Q4 — FOR COUNSEL (Tori, 2026-08-10)

Copy left unchanged pending a securities opinion. **Guard: how-c.html must keep
its `noindex, nofollow` meta until counsel answers.**

### The question for counsel

> Our public website describes a membership community. The hero of the How It
> Works page reads: "Silver & Salt Capital is a membership community that offers
> paid education and free access to our deal flow."
>
> We intend to offer securities under Rule 506(b) through single-deal SPVs, only
> to members with whom we have a pre-existing substantive relationship built
> through a required intake conversation.
>
> 1. Does describing "free access to our deal flow" on a public, unauthenticated
>    page constitute general solicitation or general advertising under
>    Rule 502(c), such that it would disqualify a subsequent 506(b) offering?
> 2. If so, does the analysis change if the phrase becomes "free access to our
>    research," or must all references to available investment opportunities move
>    behind authentication?
> 3. Is a required ~20-minute intake call sufficient to establish a pre-existing
>    substantive relationship, and what cooling-off period do you recommend
>    between a member joining and first deal exposure?

### Every "deal flow" instance to hand counsel (21 in source, excluding archives)

**Live on production now (12):**
faqs.html:843, 968, 1037, 1150, 1165, 1182 · index.html:2439 ·
investor/welcome/linkedin/index.html:311 · landscape-map.html:234 ·
manifesto.html:591 · networks.html:274 · open-research.html:826

**Draft / branch only (9):**
how-c.html:535 · hero-type.html:128, 139, 150, 161, 180 ·
membership-f.html:218, 237, 240

Note: several LIVE instances describe OTHER organizations (faqs.html:1037,
networks.html:274, landscape-map.html:234, open-research.html:826) and are
research description, not our own offer. faqs.html:1165 ("open to any accredited
investor who wants to participate in our deal flow") is the closest live
analogue to the hero phrase and should go in front of counsel with it.

## Q5 — DECIDED (Tori, 2026-08-10)

"The SEC asks that we know each other before we show anyone an opportunity,
which is why membership starts with a conversation and we are building a
community of investors."

Tori kept "The SEC asks." Remaining imprecision to raise with counsel: the SEC
prohibits general solicitation (Rule 502(c)); the pre-existing SUBSTANTIVE
relationship doctrine comes from staff no-action positions, and the relationship
must be substantive, not merely prior. The added clause helps: naming the
conversation and the community restores the relationship language that left the
gate box in Q3.

## Q7 — DECIDED (Tori, 2026-08-10)

Was: "The accreditation standard was written in the 1980s and never adjusted for
inflation."
Now: "The dollar thresholds were set in 1982 and have never been indexed to
inflation."

Why: Reg D was adopted in 1982, but the SEC HAS amended the accredited-investor
definition since (2011, Dodd-Frank 413(a), excluded primary-residence value from
net worth; 2020, added Series 7/65/82 holders, knowledgeable employees, family
offices). Only the $200K/$300K/$1M figures have never moved.

## Q8 — DECIDED (Tori, 2026-08-10)

Income prong now reads: "an annual income over $200,000 ($300,000 with a spouse)
in each of the past two years and the expectation of the same this year."

Rule 501(a)(6) requires income exceeding the threshold in each of the two most
recent years AND a reasonable expectation of the same in the current year. The
old wording ("for the past two years") let a reader who had two good years and a
bad current year believe they qualified.

Structured so "and the expectation of the same this year" attaches to the income
prong, before the "or" that introduces the net-worth prong.

**Q9 still open in this same sentence:** "more than $1 million in assets outside
their home" should be NET WORTH (assets minus liabilities).

## Q9 — DECIDED (Tori, 2026-08-10)

Was: "or more than $1 million in assets outside their home."
Now: "or a net worth over $1 million, not counting their home."

Rule 501(a)(5) is a NET WORTH test: assets minus liabilities, excluding the value
of the primary residence. "Assets" alone omits debt and overstates who qualifies.

Section 6 and the 101 block now agree; both say net worth.

## Q10 — DECIDED (Tori, 2026-08-10): source it

Citation added under the returns answer, copied from the version faqs.html
already carries for this identical claim:

> Source: Angel Capital Association (S30); Correlation Ventures, Convergence of
> Median and Mean Fund Returns (S56); Central Texas Angels reported 31% IRR
> across 115 outcomes; Tech Coast Angels reported 25% IRR across 247 outcomes
> (S59). Full source list on our FAQ page.

Root cause: the 101 block was copied verbatim from index.html, which had already
dropped the citation faqs.html keeps. index.html:2363 has the same gap.

**Open question for counsel:** the underlying sources report AVERAGE returns for
angel-GROUP investors (Wiltbank & Boeker: 2.6x over 3.5 years, ~27% IRR), while
the sentence says "top-quartile." Those are different measures. Confirm the
wording matches what S30/S56/S59 actually report.

## Q11 — DECIDED (Tori, 2026-08-10): keep as written

"At $10K+/year over five years, you build a portfolio of 30+ companies, enough
diversification to give the power law a chance to work in your favor."

Left unchanged at Tori's direction. Now sits directly above the Q10 citation and
the risk disclaimer, which mitigates the projection concern.

## Q15 — DECIDED (Tori, 2026-08-10): about 90,000, Wasatch Front

Site was publishing the HIGH scenario (~120,000) as its headline. Moved to the
base estimate (~88,000, rounded to 90,000) and corrected the geography from
"Utah" to "the Wasatch Front."

Updated + linked to accredited-women-research.html: how-c.html, index.html:1722,
faqs.html:1013, opportunity.html:455, investor/welcome/linkedin-post:292,
onboarding-scope.html:550, accredited-women-research.html (x2, rewritten because
they DESCRIBE the site figure rather than state it).

**Still open:** membership.html:477 hero ("Utah has over 100,000...") is locked
copy per CLAUDE.md and untouched pending Tori's word.

## Q13 — DECIDED (Tori, 2026-08-10): "viable"

"as many viable women-owned Utah businesses as we can find."

"Profitable" was a screen the portfolio could not meet: the same page's 101
defines angel investing as writing checks "before the company has significant
revenue." A reader who invested expecting profitable companies and got
pre-revenue startups would have a fair complaint. "Viable" describes judgment
about a company's prospects rather than a financial fact about its books.

## Q14 — DECIDED (Tori, 2026-08-10): keep, verified by Tori

"Utah's first women's angel network." Tori confirmed the claim. Recorded as her
verification, not an independent check.

## Q17 — DECIDED (Tori, 2026-08-10): footer, site-wide

Added to the shared legal block in assets/site-footer.js, so it appears on every
page that includes <site-footer>. Folded into the existing advice sentence
rather than added as a new one:

Was: "Silver & Salt Capital does not provide investment advice."
Now: "Silver & Salt Capital is not a registered broker-dealer or investment
adviser and does not provide investment advice."

Footer cache string bumped to v=9.

## Q16 — FOR COUNSEL (Tori, 2026-08-10)

Figure left as drawn. Tori will raise it with legal.

### What the page shows

The R4 diagram in section 2 ("Our investment plan") reads:
**100 WOMEN → ONE SPV $100,000 → ONE COMPANY**, then "ten deals a year,
$1,000,000." Math is internally consistent: 100 x $1,000 = $100,000;
10 x $100,000 = $1,000,000.

### The question for counsel

> We intend to form a separate single-purpose LLC (SPV) for each company we
> invest in, and to offer interests under Rule 506(b). Our marketing diagram
> shows 100 investors contributing $1,000 each into a $100,000 SPV.
>
> 1. Relying on Section 3(c)(1) of the Investment Company Act (not more than 100
>    beneficial owners), is 100 investors per SPV workable, or does it leave no
>    margin? How are spouses, joint accounts, trusts, and self-directed IRAs
>    counted toward that limit?
> 2. Because each SPV exists solely to hold one portfolio company, do look-through
>    or integration rules attribute our SPV's investors to that company's own
>    3(c)(1) count, and if so what do we owe founders in disclosure?
> 3. Should the public diagram show a lower number, and what number would you be
>    comfortable with us publishing?
> 4. Does forming and managing these SPVs, and selecting what goes into them,
>    make Silver & Salt Capital an investment adviser to the SPVs, and does any
>    compensation we take create broker-dealer registration exposure?

### Related copy on the same screen (not legally constrained, but adjacent)

- "The founding one hundred" proof band sits directly below the figure.
- The SPV definition says "one clean line on their cap table instead of a
  hundred."

Three different hundreds within one screen. Only the SPV one is capped by rule.

## Q6 — DECIDED (Tori, 2026-08-10): condition first

Sentences one and three swapped. Same content, safer reading order: the
relationship requirement now leads and the access follows it.

Was: "Every member can review the deals we have already researched... The SEC
asks that we know each other... Once we have that relationship, the research is
open to you at every membership level, including the free one."

Now: "The SEC asks that we know each other before we show anyone an opportunity,
which is why membership starts with a conversation and we are building a
community of investors. Once we have that relationship, every member can review
the deals we have already researched: the pitch recordings, the deal memos, and
the diligence behind them, at every membership level, including the free one."

Why it matters: the paragraph previously opened with the offer and reached the
condition in sentence two, so a skimmer read "every member can review the deals"
and stopped. The gate now precedes the offer in reading order.

## Q12 — DECIDED (Tori, 2026-08-10): all three

1. The "What kind of returns should I expect?" accordion now carries `open`, so
   the only place on the page that quantifies returns is visible by default,
   with its citation and disclaimer.
2. The disclaimer went from 12px to 13px, matching the citation above it, so it
   is no longer the smallest text on the page.
3. A visible risk line was added in the page body at the end of section 6,
   immediately after the five-step block and the gate box, at 15px / weight 500:

   "Angel investing carries significant risk, including the loss of your entire
   investment. Every member makes their own decision on every deal."

   Placed at the page's most optimistic moment ("Deployed by you / Working for
   you"), and it sits OUTSIDE any <details>, so no interaction is needed to see
   it. Verified: riskInsideDetails = false.

The full disclaimer (past performance, total loss, consult your advisor) still
lives with the returns figure; the body line is the plain-language version.
