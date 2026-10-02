// The invitation and application funnel, using the site's existing GA4 property.
// Do not send form values, application capabilities, gift links, or payment URLs.
(() => {
  const hosts = new Set(['silverandsaltcapital.com', 'www.silverandsaltcapital.com']);
  if (!hosts.has(window.location.hostname) || window.SSCAnalytics) return;
  const id = 'G-T8E3B0PFT4';
  const url = new URL(window.location.href);
  const path = url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const medium = url.searchParams.get('utm_medium');
  const invitation = url.searchParams.get('utm_source') === 'one_pager'
    && url.searchParams.get('utm_campaign') === 'community_invitation'
    && ['qr', 'pdf'].includes(medium);

  // An allowlist keeps arbitrary query strings out of Analytics. Join URLs can
  // contain capabilities; even the referrer must lose its query and fragment.
  const location = new URL(path, url.origin);
  if (invitation) {
    location.search = new URLSearchParams({
      utm_source: 'one_pager', utm_medium: medium, utm_campaign: 'community_invitation',
    }).toString();
  }
  let referrer = '';
  try {
    const source = new URL(document.referrer);
    referrer = source.origin + (hosts.has(source.hostname)
      && /^\/(membership|join)(\.html)?\/?$/.test(source.pathname) ? source.pathname : '/');
  } catch { /* Direct visits have no referrer. */ }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, {
    page_location: location.href,
    page_referrer: referrer,
    send_page_view: true,
  });
  const allowed = new Set(['membership_select', 'generate_lead', 'application_complete', 'membership_approved']);
  const tiers = new Set(['associate', 'standard', 'steward']);
  window.SSCAnalytics = {
    track(name, params = {}) {
      if (!allowed.has(name)) return;
      const safe = {};
      if (tiers.has(params.membership_tier)) safe.membership_tier = params.membership_tier;
      if (['onboarding_booked', 'approved_without_call'].includes(params.completion_type)) {
        safe.completion_type = params.completion_type;
      }
      window.gtag('event', name, safe);
      return true;
    },
  };
  if (invitation && path === '/membership') {
    window.gtag('event', medium === 'qr' ? 'qr_visit' : 'pdf_visit', {
      campaign_name: 'community_invitation',
    });
  }
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    const target = new URL(anchor.href, url);
    if (target.origin !== url.origin || !/^\/join(?:\.html)?\/?$/.test(target.pathname)) return;
    const tier = target.searchParams.get('tier');
    if (tiers.has(tier)) window.SSCAnalytics.track('membership_select', { membership_tier: tier });
  });
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.appendChild(tag);
})();
