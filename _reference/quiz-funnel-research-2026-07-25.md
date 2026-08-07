# Quiz-funnel design evidence (researched 2026-07-25)

Commissioned for the membership-f.html "choose your own adventure" design.
Summary of findings; full detail lived in the 2026-07-25 design session.

## The honest evidence picture
- Vendor stats (Interact: 40.1% start-to-lead, 65% completion; LeadQuizzes; Outgrow)
  measure people who STARTED the quiz, and are vendor-reported. Directional only.
- Independently credible pillars:
  - Baymard (usability testing): completed steps should collapse into visible
    summaries showing the ACTUAL answer with an Edit link; editing must never
    wipe later answers; keep flows linear. (baymard.com/blog/accordion-checkout-usability)
  - Nielsen Norman Group: wizards are the right pattern for novice users and
    infrequent decisions; show labeled steps and progress. (nngroup.com/articles/wizards)
  - Zuko form analytics: multi-step wins at 6+ fields; easy first question;
    persist state between steps (up to +10% conversion from persistence alone).
  - Survicate 21k-survey study + Outgrow benchmarks: completion 65-85% through
    ~7 questions, then roughly -5-10% per extra question.
  - Venture Harbour pre/post tests: B2C financial lead-gen 11% -> 46% moving to
    multi-step; contact info requested LAST ("skin in the game").
  - NextAfter (nonprofit A/B library): multi-step/reduced-friction acquisition
    consistently outperforms for mission-driven funnels.
- GOV.UK / NN/g warning: "pick who you are" fails when options use internal
  labels; write options as first-person situations in the visitor's own words.
- Biggest killer: gating results behind an email. Ask AFTER showing the result
  (~40% of completers vs ~5% when gated upfront; practitioner data).

## How membership-f.html implements this (as of 2026-07-25)
1. 5 questions (safe zone), one per screen, easy invitation-style opener.
2. Visible answer trail with real answer text + Change links; edits preserve
   later answers (Baymard pattern).
3. Linear flow, back button, sessionStorage persistence (resume + result recall).
4. Labeled progress steps ("Your seat / Wealth for Utah women / ...").
5. First-person situation options; path names (member/investor) appear only on
   the result screen.
6. Results shown immediately; email asked only afterward, optional.
7. Results are personalized recommendations with "what happens next" steps and
   one primary CTA; routing: Utah woman -> membership (always); everyone else ->
   the investment group, with monthly-update fallback.
8. Newsletter source tag carries the full answer path for email segmentation.
9. Hero signals shortness: "Five quick questions, about a minute."
