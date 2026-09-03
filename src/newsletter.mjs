// Newsletter broadcast for Silver & Salt Capital.
//
// WHY THIS EXISTS SEPARATELY FROM src/email.ts. That module sends the four
// transactional lifecycle emails: one recipient, plaintext, fired by a flow.
// A newsletter is the opposite on every axis. It is marketing class, so it is
// consent-gated and legally required to carry an unsubscribe path; it carries
// an HTML body with a plaintext alternative; and it goes to a whole list, which
// Cloudflare Email Service caps at 50 recipients per send. Bolting that onto
// sendTemplated would have made the transactional path carry conditionals it
// never needs.
//
// WHY AN OUTBOX RATHER THAN A LOOP. A Worker request cannot hold a send to a
// few hundred people, and a retry must never re-deliver. So queueing writes one
// `newsletterRecipients` row per address and the drain moves rows from pending
// to sent in batches. The ROW is the unit of idempotency: a row already marked
// sent is never picked up again, however many times the drain runs.
//
// ONE MESSAGE PER RECIPIENT, ALWAYS. The list is never put in to/cc/bcc. That
// is partly privacy (a bcc slip exposes every member's address to every member)
// and partly function: the unsubscribe link and the greeting are per-person, so
// a shared message could not carry either.

// The same {{var}} substitution src/email.ts uses. An unknown key renders empty
// rather than leaving the braces visible in someone's inbox.
export function render(template, vars) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// Shallow syntax normalization. Returns the lowercased address, or null when it
// could not be an address at all. Deliberately permissive: real deliverability
// is decided by the transport and the bounce, not by a clever regex.
export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const addr = raw.trim().replace(/^<|>$/g, "").toLowerCase();
  if (addr.length < 3 || addr.length > 320) return null;
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(addr)) return null;
  return addr;
}

// Minimal RFC 4180 CSV reader: quoted fields, embedded commas, doubled quotes,
// CRLF or LF. Written here rather than pulled in as a dependency because the
// input is a list Tori exports by hand, and a parser we can read is worth more
// than one that handles dialects this will never see.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = String(text).replace(/^﻿/, ""); // strip the Excel BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Turn a pasted CSV into recipients. Accepts a header row naming an email
// column (any header containing "email"), plus an optional first-name column;
// with no recognizable header it treats column 0 as the address.
//
// Returns BOTH the accepted rows and the rejected ones. Silently dropping a
// malformed address would mean someone never gets the letter and nobody ever
// learns why, so rejects are surfaced to the admin instead.
export function parseRecipientCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { recipients: [], rejected: [], duplicates: 0 };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const emailIdx = header.findIndex((h) => h.includes("email"));
  const nameIdx = header.findIndex((h) => h === "firstname" || h === "first name" || h === "first");
  const hasHeader = emailIdx !== -1;
  const body = hasHeader ? rows.slice(1) : rows;
  const eIdx = hasHeader ? emailIdx : 0;

  const seen = new Set();
  const recipients = [];
  const rejected = [];
  let duplicates = 0;

  for (const r of body) {
    const email = normalizeEmail(r[eIdx]);
    if (!email) {
      rejected.push({ value: (r[eIdx] ?? "").trim(), reason: "not a valid address" });
      continue;
    }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    const firstName = hasHeader && nameIdx !== -1 ? (r[nameIdx] ?? "").trim() : "";
    recipients.push(firstName ? { email, firstName } : { email });
  }
  return { recipients, rejected, duplicates };
}

// A stable, unguessable unsubscribe token. crypto.randomUUID exists in Workers
// and in Node 19+, which covers the Worker and the test runner alike.
export function mintToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function unsubscribeUrl(siteOrigin, token) {
  return `${String(siteOrigin).replace(/\/+$/, "")}/api/newsletter/unsubscribe?t=${encodeURIComponent(token)}`;
}

// May this address receive THIS issue? Evaluated against the subscriber record
// at send time rather than at queue time, so an unsubscribe that lands while a
// send is draining is honored by the rows that have not gone out yet.
export function sendability(signup) {
  if (!signup) return { ok: false, reason: "no subscriber record" };
  if (signup.status === "unsubscribed") return { ok: false, reason: "unsubscribed" };
  if (signup.deliveryStatus === "bounced") return { ok: false, reason: "bounced" };
  if (signup.deliveryStatus === "complained") return { ok: false, reason: "complained" };
  return { ok: true };
}

// Build the message for one recipient.
//
// The two List-Unsubscribe headers are what make the unsubscribe control appear
// natively in Gmail beside the sender name. RFC 8058 one-click requires the URL
// to accept POST, which the route does; the mailto is the fallback for clients
// that only honor that form. Gmail and Yahoo both treat these as a requirement
// for bulk senders, not a nicety.
export function buildPayload(opts) {
  const {
    fromEmail, fromName, replyTo, to, subject, html, text,
    unsubscribeUrl: unsubUrl, unsubscribeMailto,
  } = opts;

  const vars = { ...(opts.vars ?? {}), unsubscribe_url: unsubUrl, unsubscribeUrl: unsubUrl };

  const headers = {
    "List-Unsubscribe": unsubscribeMailto
      ? `<${unsubUrl}>, <mailto:${unsubscribeMailto}?subject=unsubscribe>`
      : `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };

  return {
    from: fromName ? { name: fromName, email: fromEmail } : fromEmail,
    to,
    subject: render(subject, vars),
    html: render(html, vars),
    // Never HTML-only. A missing plaintext part is a well-known spam signal and
    // leaves text-only and accessibility clients with nothing to show.
    text: render(text, vars),
    replyTo,
    headers,
  };
}

// A readable plaintext fallback from the HTML body, offered to the admin as a
// STARTING POINT to edit. It is not used automatically: an auto-stripped body
// reads like machine output, and the plaintext part is what a real text client
// shows, so it deserves a human pass.
export function textFromHtml(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&middot;/g, "·")
    .replace(/&zwnj;|&#847;/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Cloudflare Email Service caps a single send at 50 recipients. We send one
// message per recipient, so that cap is not the binding constraint; the drain
// batch size is about how much work one Worker invocation should attempt.
export const DRAIN_BATCH = 20;
