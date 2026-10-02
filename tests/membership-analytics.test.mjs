import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createJoinMeasurement } from '../src/app/join-measurement.mjs';

const source = readFileSync(new URL('../assets/membership-analytics.js', import.meta.url), 'utf8');
function browser(href, referrer = '') {
  const window = { location: new URL(href) };
  const listeners = {};
  const scripts = [];
  const document = {
    referrer, addEventListener: (type, fn) => { listeners[type] = fn; },
    createElement: () => ({}), head: { appendChild: (tag) => scripts.push(tag) },
  };
  runInNewContext(source, { window, document, URL, URLSearchParams });
  return { window, document, listeners, scripts, events: () => (window.dataLayer || []).map((args) => [...args]) };
}
const campaign = '?utm_source=one_pager&utm_medium=qr&utm_campaign=community_invitation';
describe('invitation analytics', () => {
  it('loads the existing property once and attributes the QR landing', () => {
    const b = browser('https://silverandsaltcapital.com/membership' + campaign);
    expect(b.scripts).toHaveLength(1);
    expect(b.scripts[0].src).toContain('G-T8E3B0PFT4');
    expect(b.events().filter((e) => e[0] === 'config')).toHaveLength(1);
    expect(b.events()).toContainEqual(['event', 'qr_visit', { campaign_name: 'community_invitation' }]);
    runInNewContext(source, { window: b.window, document: b.document, URL, URLSearchParams });
    expect(b.scripts).toHaveLength(1);
  });
  it('separates PDF clicks and excludes ordinary visits from QR counts', () => {
    const pdf = browser('https://silverandsaltcapital.com/membership' + campaign.replace('=qr', '=pdf'));
    expect(pdf.events().some((e) => e[1] === 'pdf_visit')).toBe(true);
    const direct = browser('https://silverandsaltcapital.com/membership');
    expect(direct.events().some((e) => e[1] === 'qr_visit')).toBe(false);
  });
  it('strips capabilities, arbitrary queries and fragments from page and referrer', () => {
    const b = browser('https://silverandsaltcapital.com/join?seat=secret&email=private@example.com#payment_secret',
      'https://silverandsaltcapital.com/join?application=secret');
    expect(b.events()[1][2]).toMatchObject({
      page_location: 'https://silverandsaltcapital.com/join', page_referrer: 'https://silverandsaltcapital.com/join',
    });
    b.window.SSCAnalytics.track('generate_lead', { email: 'private@example.com', applicationId: 'secret', membership_tier: 'associate' });
    expect(b.events().at(-1)).toEqual(['event', 'generate_lead', { membership_tier: 'associate' }]);
    expect(JSON.stringify(b.events())).not.toMatch(/secret|private@example/);
  });
  it('does not send development or staging traffic to production Analytics', () => {
    for (const host of ['localhost:3000', 'silver-and-salt-capital-dev.example.workers.dev']) {
      const b = browser('http://' + host + '/membership' + campaign);
      expect(b.scripts).toHaveLength(0);
      expect(b.events()).toHaveLength(0);
    }
  });
  it('tracks a valid same-site membership choice, not arbitrary outgoing links', () => {
    const b = browser('https://silverandsaltcapital.com/membership');
    for (const href of ['https://external.example/join?tier=standard', '/join.html?tier=associate']) {
      b.listeners.click({ target: { closest: () => ({ href }) } });
    }
    expect(b.events().filter((e) => e[1] === 'membership_select')).toEqual([
      ['event', 'membership_select', { membership_tier: 'associate' }],
    ]);
  });
  it('ships a permanent branded QR URL with a changeable campaign destination', () => {
    const redirects = readFileSync(new URL('../_redirects', import.meta.url), 'utf8');
    expect(redirects).toContain('/invite /membership' + campaign + ' 302');
    for (const page of ['membership.html', 'join.html']) {
      expect(readFileSync(new URL('../' + page, import.meta.url), 'utf8')).toContain('/assets/membership-analytics.js?v=1');
    }
  });
});

function journey(initialApplicationId = null, values = new Map()) {
  const emit = vi.fn(() => true);
  const storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  return { emit, values, observe: createJoinMeasurement({ emit, storage, initialApplicationId }) };
}
describe('verified application milestones', () => {
  it('does not count form views or pending payments as completed applications', () => {
    const j = journey();
    j.observe({ step: 'form' }, 'standard');
    expect(j.emit).not.toHaveBeenCalled();
    for (const step of ['payment', 'paymentPending', 'booking']) j.observe({ step, applicationId: 'capability' }, 'standard');
    expect(j.emit.mock.calls).toEqual([['generate_lead', { membership_tier: 'standard' }]]);
    j.observe({ step: 'done', applicationId: 'capability' }, 'standard');
    j.observe({ step: 'done', applicationId: 'capability' }, 'standard');
    expect(j.emit.mock.calls.at(-1)).toEqual(['application_complete', { membership_tier: 'standard', completion_type: 'onboarding_booked' }]);
    expect(j.emit).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(j.emit.mock.calls)).not.toContain('capability');
  });
  it('handles free approval and deduplicates across reloads', () => {
    const j = journey();
    j.observe({ step: 'accepted', applicationId: 'free-capability' }, 'associate');
    expect(j.emit.mock.calls.map((c) => c[0])).toEqual(['generate_lead', 'application_complete', 'membership_approved']);
    const reload = journey('free-capability', j.values);
    reload.observe({ step: 'accepted', applicationId: 'free-capability' }, 'associate');
    expect(reload.emit).not.toHaveBeenCalled();
  });
  it('never turns a repeated historical confirmation into a new conversion', () => {
    const j = journey('old-capability');
    j.observe({ step: 'done', applicationId: 'old-capability' }, 'standard');
    j.observe({ step: 'done', applicationId: 'old-capability' }, 'standard');
    expect(j.emit).not.toHaveBeenCalled();
  });
  it('counts finishing a resumed booking without inventing a new lead', () => {
    const j = journey('old-capability');
    j.observe({ step: 'booking', applicationId: 'old-capability' }, 'standard');
    j.observe({ step: 'done', applicationId: 'old-capability' }, 'standard');
    expect(j.emit.mock.calls.map((c) => c[0])).toEqual(['application_complete']);
  });
  it('survives unavailable storage or analytics without affecting the flow', () => {
    const emit = vi.fn(() => true);
    const observe = createJoinMeasurement({ emit, storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
    const state = { step: 'accepted', applicationId: 'capability' };
    expect(() => { observe(state, 'associate'); observe(state, 'associate'); }).not.toThrow();
    expect(emit).toHaveBeenCalledTimes(3);
    const failing = createJoinMeasurement({ emit() { throw Error(); } });
    expect(() => failing(state)).not.toThrow();
  });
});
