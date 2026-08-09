/* ═══════════════════════════════════════════════════════════════
   <three-yeses> — the "choose your yes" panel, the site's signature
   conversion component. One membership hero card, one quiet investor
   card, one free monthly-update email card. Appears at the bottom of
   the How It Works tab and membership.html (and anywhere else a page
   should end in an ask).

   Pages opt in by including:
     <three-yeses></three-yeses>
     <script src="assets/three-yeses.js"></script>

   Compliance notes (Living Document v9 §15.6, do not soften):
   - The investor card must carry the "membership is never required
     to invest" clarity and stay relationship-first: no returns
     language, no deal names, no urgency. 506(b) quiet lane.
   - The monthly update is community-layer only: gatherings, classes,
     movement news. Never deal content.

   The monthly update is a member benefit (Tori, 2026-08-07): the
   third card invites the reader to join as a free Associate rather
   than collecting an email. The old /api/newsletter capture is
   retired.
   ═══════════════════════════════════════════════════════════════ */

const THREE_YESES_CSS = `
  three-yeses { display: block; }
  .ty-wrap { max-width: 1100px; margin: 0 auto; padding: 72px 48px 84px; }
  .ty-head { text-align: center; max-width: 640px; margin: 0 auto 40px; }
  .ty-label { font-size: 12px; letter-spacing: .2em; text-transform: uppercase;
    font-weight: 700; color: var(--ty-accent, var(--pop, #D16B4F)); margin-bottom: 14px; }
  .ty-title { font-family: 'Cormorant Garamond', serif; font-weight: 300;
    font-size: clamp(30px, 4.5vw, 46px); line-height: 1.12; color: var(--ty-ink, var(--moss, #2F3E34)); margin-bottom: 14px; }
  .ty-title em { font-style: italic; color: var(--ty-accent, var(--pop, #D16B4F)); }
  .ty-sub { font-size: 15.5px; line-height: 1.75; color: var(--ty-body, var(--moss-light, #4A5E50)); font-weight: 300; }
  .ty-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: stretch; }
  @media (max-width: 900px) { .ty-grid { grid-template-columns: 1fr; max-width: 480px; margin: 0 auto; } }
  .ty-card { border-radius: 12px; padding: 30px 28px; display: flex; flex-direction: column;
    background: var(--ty-card-bg, #fff); border: 1px solid rgba(47,62,52,0.12); }
  .ty-card-hero { background: var(--ty-hero-bg, var(--moss, #2F3E34)); border-color: transparent; }
  .ty-kicker { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; font-weight: 700; margin-bottom: 14px; }
  .ty-price { font-family: 'Cormorant Garamond', serif; font-weight: 300; font-size: 34px; line-height: 1.05; margin-bottom: 14px; }
  .ty-copy { font-size: 14.5px; line-height: 1.7; font-weight: 300; flex: 1; margin-bottom: 22px; }
  .ty-note { font-size: 12.5px; line-height: 1.6; font-weight: 300; margin-top: 14px; }
  .ty-btn { display: inline-block; text-align: center; font-family: 'Satoshi', sans-serif; font-weight: 700;
    font-size: 14.5px; padding: 13px 26px; border-radius: 8px; text-decoration: none; transition: all .2s; border: 0; cursor: pointer; }
  .ty-card-hero .ty-kicker { color: var(--ty-hero-accent, #7CB83F); }
  .ty-card-hero .ty-price, .ty-card-hero .ty-copy { color: rgba(255,255,255,0.92); }
  .ty-card-hero .ty-copy { color: rgba(255,255,255,0.75); }
  .ty-card-hero .ty-btn { background: var(--ty-hero-accent, #7CB83F); color: var(--moss, #2F3E34); }
  .ty-card-hero .ty-btn:hover { transform: translateY(-2px); }
  .ty-card-hero .ty-more { font-size: 13px; margin-top: 14px; text-align: center; }
  .ty-card-hero .ty-more a { color: rgba(255,255,255,0.75); }
  .ty-quiet .ty-kicker { color: var(--ty-ink, var(--moss, #2F3E34)); }
  .ty-quiet .ty-price { font-size: 26px; color: var(--ty-ink, var(--moss, #2F3E34)); padding-top: 8px; }
  .ty-quiet .ty-copy, .ty-free .ty-copy { color: var(--ty-body, var(--moss-light, #4A5E50)); }
  .ty-quiet .ty-btn { border: 1px solid var(--ty-ink, var(--moss, #2F3E34)); color: var(--ty-ink, var(--moss, #2F3E34)); background: transparent; }
  .ty-quiet .ty-btn:hover { background: rgba(47,62,52,0.06); }
  .ty-quiet .ty-note { color: var(--ty-body, var(--moss-light, #4A5E50)); }
  .ty-free .ty-kicker { color: var(--ty-accent, var(--pop, #D16B4F)); }
  .ty-free .ty-price { font-size: 26px; color: var(--ty-ink, var(--moss, #2F3E34)); padding-top: 8px; }
  .ty-form { display: flex; flex-direction: column; gap: 10px; }
  .ty-input { font-family: 'Satoshi', sans-serif; font-size: 14.5px; padding: 12px 14px;
    border: 1px solid rgba(47,62,52,0.25); border-radius: 8px; background: #fff; color: var(--moss, #2F3E34); width: 100%; }
  .ty-input:focus { outline: 2px solid var(--ty-accent, var(--pop, #D16B4F)); outline-offset: 1px; }
  .ty-free .ty-btn { background: var(--ty-ink, var(--moss, #2F3E34)); color: #fff; }
  .ty-free .ty-btn:hover { transform: translateY(-2px); }
  .ty-msg { font-size: 13px; line-height: 1.5; margin-top: 4px; }
`;

const THREE_YESES_HTML = `
<section class="ty-wrap">
  <div class="ty-head">
    <p class="ty-label">Choose Your Yes</p>
    <h2 class="ty-title">Three ways to <em>say yes</em>.</h2>
    <p class="ty-sub">Membership and investing are separate: community on one side, access to investment opportunities on the other. Membership is never required to invest, and investing is never expected of members. Choose either, choose both, or simply follow along.</p>
  </div>
  <div class="ty-grid">

    <div class="ty-card ty-card-hero">
      <p class="ty-kicker">Become a Member</p>
      <p class="ty-price">Free, $900, or $5,000 a year</p>
      <p class="ty-copy">Six classes developed by Invest for Better, more than 20 gatherings a year, a seat for your mother or your daughter, and a community of women who talk about money out loud. Open to women in Utah, and accreditation is never part of the application.</p>
      <a class="ty-btn" href="membership.html">Choose your membership</a>
      <p class="ty-more"><a href="membership.html#memberships">Compare the three &rarr;</a></p>
    </div>

    <div class="ty-card ty-quiet">
      <p class="ty-kicker">Invest, Deal by Deal</p>
      <p class="ty-price">For accredited investors</p>
      <p class="ty-copy">Each year we find and screen six to ten Utah companies founded by women. You invest deal by deal, and money moves only when you say yes. Investing with us starts with a relationship: we get to know you first.</p>
      <a class="ty-btn" href="mailto:tori@silverandsaltcapital.com?subject=Introduce%20yourself">Introduce Yourself</a>
      <p class="ty-note">Membership provides access to education, networking, and community benefits. Membership does not guarantee access to private investment opportunities.</p>
    </div>

    <div class="ty-card ty-free">
      <p class="ty-kicker">Follow the Movement</p>
      <p class="ty-price">Free, with membership</p>
      <p class="ty-copy">The monthly update: the gatherings, the classes, the women, and what the movement built, in your inbox each month during the season. It arrives with membership, and Associate membership is free. Apply, meet Tori, and follow along from the inside.</p>
      <a class="ty-btn" href="join.html?tier=associate">Become an Associate</a>
    </div>

  </div>
</section>
`;

class ThreeYeses extends HTMLElement {
  connectedCallback() {
    if (!document.getElementById('ty-styles')) {
      const style = document.createElement('style');
      style.id = 'ty-styles';
      style.textContent = THREE_YESES_CSS;
      document.head.appendChild(style);
    }
    this.innerHTML = THREE_YESES_HTML;
  }
}

customElements.define('three-yeses', ThreeYeses);
