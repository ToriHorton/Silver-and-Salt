/* ═══════════════════════════════════════════════════════════════
   <site-footer> — single source of truth for the site footer.
   Edit this file to update the footer everywhere it appears.

   Pages opt in by including:
     <site-footer></site-footer>
     <script src="assets/site-footer.js"></script>

   Notes:
   - Renders into light DOM so existing footer CSS in styles.css
     (.f-sitemap, .f-mark, .f-brand-row, .f-legal, etc.) applies.
   - Inner home-page anchors (Start, Home, Thesis, How, Story,
     About) use href="index.html#xxx". On the home page itself,
     clicks are intercepted and routed through showPage() so the
     SPA-style tab switcher fires instead of a full navigation.
   ═══════════════════════════════════════════════════════════════ */

const SITE_FOOTER_HTML = `
<footer>
  <div class="f-inner" style="flex-direction:column;gap:16px">
    <div class="f-sitemap">
      <div class="f-sitemap-col">
        <div class="f-sitemap-heading">Navigate</div>
        <a class="f-sitemap-link" href="index.html#start" data-home-tab="start">Start Here</a>
        <a class="f-sitemap-link" href="index.html" data-home-tab="welcome">Home</a>
        <a class="f-sitemap-link" href="index.html#thesis" data-home-tab="thesis">The Thesis</a>
        <a class="f-sitemap-link" href="index.html#how" data-home-tab="how">How It Works</a>
        <a class="f-sitemap-link" href="membership.html">Membership</a>
      </div>
      <div class="f-sitemap-col">
        <div class="f-sitemap-heading">About</div>
        <a class="f-sitemap-link" href="index.html#story" data-home-tab="story">Our Story</a>
        <a class="f-sitemap-link" href="index.html#about" data-home-tab="about">Community Commitments</a>
        <a class="f-sitemap-link" href="manifesto.html">Regenerative Capital</a>
        <a class="f-sitemap-link" href="faqs.html">FAQs</a>
      </div>
      <div class="f-sitemap-col">
        <div class="f-sitemap-heading">Research</div>
        <a class="f-sitemap-link" href="opportunity.html">The Opportunity</a>
        <a class="f-sitemap-link" href="utah-funding-2025.html">Utah Funding 2025</a>
        <a class="f-sitemap-link" href="accredited-women-research.html">Accredited Investors</a>
        <a class="f-sitemap-link" href="landscape-map.html">National Landscape Map</a>
        <a class="f-sitemap-link" href="networks.html">The Networks</a>
        <a class="f-sitemap-link" href="recommendations.html">Recommendations</a>
        <a class="f-sitemap-link" href="open-research.html">References</a>
      </div>
      <div class="f-sitemap-col">
        <div class="f-sitemap-heading">Press</div>
        <a class="f-sitemap-link" href="https://forms.gle/dN1DJgWZs9X7Z8U8A" target="_blank" rel="noopener">Press Contact</a>
        <a class="f-sitemap-link" href="brand-assets.html">Brand Assets</a>
      </div>
    </div>
    <div class="f-news" style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:18px 0;border-top:1px solid rgba(47,62,52,0.1);border-bottom:1px solid rgba(47,62,52,0.1)">
      <p style="font-size:14px;font-weight:300;flex:1;min-width:220px;margin:0">Follow the movement. Join as a member at the price point that best fits your interest and stay informed.</p>
      <a href="membership.html" style="font-family:'Satoshi',sans-serif;font-weight:700;font-size:13.5px;padding:9px 16px;border-radius:6px;background:var(--moss,#2F3E34);color:#fff;text-decoration:none;white-space:nowrap">Become a member</a>
    </div>
    <div class="f-brand-row">
      <div class="f-left">
        <div class="f-mark">
          <div class="split-circle"><div class="sc-left"></div><div class="sc-right"></div><div class="sc-amp">&amp;</div></div>
        </div>
        <div class="f-content">
          <div class="f-wordmark">Silver <span class="brand-amp">&amp;</span> Salt Capital</div>
          <div class="f-tag">Connecting capital to Utah founders who use it best.</div>
        </div>
      </div>
      <div class="f-right" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <div class="f-copy">&copy; 2026 Silver <span class="brand-amp">&amp;</span> Salt Capital</div>
        <div class="f-copy">Utah</div>
      </div>
    </div>
    <p class="f-legal">Membership provides access to education, networking, and community benefits. Membership does not guarantee access to private investment opportunities. Silver <span class="brand-amp">&amp;</span> Salt Capital is not a registered broker-dealer or investment adviser and does not provide investment advice. All investment decisions are made independently by individual members. This site does not constitute an offer to sell or a solicitation of an offer to buy any securities.</p>
  </div>
</footer>
`;

class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = SITE_FOOTER_HTML;
    // The monthly update is a member benefit (Tori, 2026-08-07): the
    // band invites the reader to join as a free Associate. The old
    // /api/newsletter email capture is retired.
    this.querySelectorAll('a[data-home-tab]').forEach(a => {
      a.addEventListener('click', (e) => {
        if (typeof window.showPage === 'function') {
          e.preventDefault();
          window.showPage(a.dataset.homeTab);
        }
      });
    });
  }
}

customElements.define('site-footer', SiteFooter);
