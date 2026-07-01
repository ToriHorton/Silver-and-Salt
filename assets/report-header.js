/* ═══════════════════════════════════════════════════════════════
   <report-header> — single source of truth for the report hero.
   Edit THIS file to change the header design for every report at once.

   Usage on each report page (just before the report body):
     <report-header
       number="06"
       title="The women's funding"
       emphasis="landscape."
       summary="One to three sentences about what the report says."
       updated="Mar 2026">
     </report-header>
     <script src="assets/report-header.js?v=1" defer></script>

   Attributes:
   - number    Report number shown in the badge (e.g. "01"…"06").
   - title     The lead of the headline (rendered in cream).
   - emphasis  The closing word(s) of the headline, set in gold italic.
   - summary   1–3 sentences describing the report.
   - updated   The month the report was last updated (e.g. "Mar 2026").

   Renders into light DOM and uses the global color tokens from
   styles.css. The component injects its own <style> once per page.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const STYLE_ID = 'report-header-styles';
  const CSS = `
.rpt-hero{
  background:linear-gradient(140deg, #34463d 0%, #232e27 100%);
  padding:120px 48px 0; position:relative; overflow:hidden;
}
.rpt-hero-inner{ max-width:1100px; margin:0 auto; position:relative; z-index:1; }
.rpt-amp{ position:absolute; right:-52px; top:50%; transform:translateY(-50%); font-family:'Cormorant Garamond',serif; font-weight:400; font-style:normal; font-size:clamp(300px,46vw,560px); line-height:1; color:rgba(196,164,126,0.10); z-index:0; pointer-events:none; }
.rpt-eyebrow{
  display:inline-flex; align-items:center; gap:14px;
  font-family:'Satoshi',sans-serif; font-size:12px; font-weight:700;
  letter-spacing:0.18em; text-transform:uppercase; color:var(--warm);
  margin:0 0 28px;
}
.rpt-eyebrow::before{ content:''; width:36px; height:1px; background:var(--warm); flex-shrink:0; }
.rpt-h1{
  font-family:'Cormorant Garamond',serif; font-size:clamp(44px,7vw,92px);
  font-weight:400; color:var(--cream); line-height:1.03; letter-spacing:-0.02em;
  margin:0 0 28px; max-width:18ch;
}
.rpt-h1 em{ font-style:italic; color:#5DCAA5; }
.rpt-summary{
  font-size:17px; line-height:1.65; color:rgba(251,248,242,0.78);
  font-weight:300; max-width:620px; margin:0 0 40px;
}
.rpt-hero-meta{
  display:flex; gap:18px; flex-wrap:wrap;
  font-family:'Satoshi',sans-serif; font-size:11px;
  letter-spacing:0.14em; text-transform:uppercase; color:rgba(251,248,242,0.7);
  padding:18px 0 24px; border-top:1px solid rgba(255,255,255,0.12); margin:0;
}
.rpt-hero-meta b{ color:var(--cream); font-weight:700; }
@media(max-width:768px){
  .rpt-hero{ padding:100px 20px 0; }
  .rpt-h1{ font-size:clamp(32px,9vw,48px); margin-bottom:20px; }
  .rpt-summary{ font-size:15px; margin-bottom:28px; }
}`;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  class ReportHeader extends HTMLElement {
    connectedCallback() {
      ensureStyles();
      const number = this.getAttribute('number') || '';
      const name = this.getAttribute('name') || '';
      const title = this.getAttribute('title') || '';
      const emphasis = this.getAttribute('emphasis') || '';
      const summary = this.getAttribute('summary') || '';
      const updated = this.getAttribute('updated') || '';

      const emHTML = emphasis ? ` <em>${emphasis}</em>` : '';
      const summaryHTML = summary ? `<p class="rpt-summary">${summary}</p>` : '';
      const metaHTML = updated
        ? `<div class="rpt-hero-meta"><span><b>Updated ${updated}</b></span></div>`
        : '';

      this.innerHTML = `
<section class="rpt-hero">
  <span class="rpt-amp" aria-hidden="true">&amp;</span>
  <div class="rpt-hero-inner">
    <div class="rpt-eyebrow">S&amp;S Capital Research &middot; ${name || ('Report No. ' + number)}</div>
    <h1 class="rpt-h1">${title}${emHTML}</h1>
    ${summaryHTML}
    ${metaHTML}
  </div>
</section>`;
    }
  }

  if (!customElements.get('report-header')) {
    customElements.define('report-header', ReportHeader);
  }
})();
