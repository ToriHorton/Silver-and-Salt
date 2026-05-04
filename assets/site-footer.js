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
        <a class="f-sitemap-link" href="networks.html">The Networks</a>
        <a class="f-sitemap-link" href="utah-funding-2025.html">Utah Funding 2025</a>
        <a class="f-sitemap-link" href="utah-funding-research.html">Utah Capital Landscape</a>
        <a class="f-sitemap-link" href="accredited-women-research.html">Accredited Investors</a>
        <a class="f-sitemap-link" href="landscape-map.html">National Landscape Map</a>
        <a class="f-sitemap-link" href="source-bible.html">References</a>
        <a class="f-sitemap-link" href="open-research.html">Open Research</a>
      </div>
      <div class="f-sitemap-col">
        <div class="f-sitemap-heading">Press</div>
        <a class="f-sitemap-link" href="https://forms.gle/dN1DJgWZs9X7Z8U8A" target="_blank" rel="noopener">Press Contact</a>
        <a class="f-sitemap-link" href="brand-assets.html">Brand Assets</a>
      </div>
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
    <p class="f-legal">For accredited investors only. Silver <span class="brand-amp">&amp;</span> Salt Capital does not provide investment advice. All investment decisions are made independently by individual members. This site does not constitute an offer to sell or a solicitation of an offer to buy any securities.</p>
  </div>
</footer>
`;

class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = SITE_FOOTER_HTML;
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
