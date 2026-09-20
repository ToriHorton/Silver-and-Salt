#!/usr/bin/env node
// Render every member-facing signup email from _reference/signup-emails.md
// into the general email template (_reference/email-template.html), so each
// draft is reviewed in the form a member will see. Read-only against the
// tenant: this writes local preview files only.
//
// Per section the file supplies **Subject:**, **Preheader:** (optional),
// **Heading:** (optional; 27 characters at most) and the ```text body. The
// body renders as paragraphs. A paragraph whose last line is a bare URL or a
// URL placeholder becomes the button (label from BUTTONS below); the closing
// "Warmly, / Tori / Silver & Salt Capital" is dropped because the template
// carries the sign-off. Admin notices to Tori stay plain text and are skipped.
//
// Usage:  node _scripts/render-signup-emails.mjs
// Output: _reference/signup-emails-html/<key>.html and index.html

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const SOURCE = new URL("_reference/signup-emails.md", ROOT);
const TEMPLATE = new URL("_reference/email-template.html", ROOT);
const OUT_DIR = new URL("_reference/signup-emails-html/", ROOT);
const HEADING_LIMIT = 27;

// Member-facing emails, in the order a new member meets them.
const MEMBER_KEYS = ["bookingReminderFree", "paymentReminder", "prepEmail", "onboardingInvite", "namedSeatInvitation", "bookingReminder", "paymentConfirmation", "declinePaid", "declineFree"];
const BUTTONS = {
  bookingReminderFree: { label: "Book your introduction call", href: "{{membersUrl}}" },
  paymentReminder: { label: "Complete your membership payment", href: "{{membersUrl}}" },
  prepEmail: null,
  onboardingInvite: { label: "Log In", href: "{{membersUrl}}", after: /\{\{membersUrl\}\}/ },
  namedSeatInvitation: { label: "Book your introduction call", href: "{{joinUrl}}" },
  bookingReminder: { label: "Book your introduction call", href: "https://silverandsaltcapital.com/members/" },
  paymentConfirmation: { label: "Open your member area", href: "https://silverandsaltcapital.com/members/" },
  declinePaid: null,
  declineFree: null,
};
// Group texts the file documents; filled in so the preview reads as sent.
const GROUP_TEXT = {
  commitmentText: "We show up for one another, learn together, and keep what is shared in the room.",
  normsText: "Come prepared, participate generously, and honor confidentiality.",
  // Preview-only sample values; the booking route passes only firstName today (startAt arrives with Chapter 0.52.x).
  firstName: "Martha",
  purchaserName: "Lauren Sercu",
  startAt: "Tuesday, September 23, 2026 at 10:00 AM MDT",
  refundPolicyText: "Payment is collected when you apply. Before approval, a decline or cancellation receives a full refund and stops renewal. Once approved, the paid membership term is non-refundable. Cancel before renewal to stop the next charge; access continues through the paid term. Your checkout shows the exact amount, service term, discount duration and renewal amount before you consent.",
};

const AMP = `<span class="brand-amp" style="font-family:'Cormorant Garamond',Georgia,serif; font-style:normal;">&amp;</span>`;
const URL_RE = /^(https?:\/\/\S+|\{\{[a-zA-Z]+Url\}\})$/;

export function parseSections(markdown) {
  const out = {};
  for (const section of markdown.split(/^#{2,3} /m).slice(1)) {
    const key = section.split("\n", 1)[0].trim().split(/\s/)[0];
    if (!MEMBER_KEYS.includes(key)) continue;
    const line = (label) => section.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, "m"))?.[1] ?? "";
    const body = section.match(/```text\r?\n([\s\S]*?)\r?\n```/)?.[1];
    // The "declinePaid and declineFree" intro shares a first word with a real
    // section and carries no copy; only a section with copy counts.
    if (!line("Subject") || body === undefined) continue;
    out[key] = {
      subject: line("Subject"),
      preheader: line("Preheader"),
      heading: line("Heading"),
      enabled: !/^\*\*Enabled:\*\*\s*no\s*$/mi.test(section),
      text: body.replace(/\r\n/g, "\n"),
    };
  }
  return out;
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brand = (s) => escape(s).replace(/Silver &amp; Salt Capital/g, `Silver ${AMP} Salt Capital`);
const inline = (s) =>
  brand(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])|(\{\{[a-zA-Z]+Url\}\})/g, (m) => `<a href="${m}" style="color:#2F3E34; text-decoration:underline;">${m}</a>`);

const P = (html, last) => `<p style="margin:0${last ? "" : " 0 18px"};">${html}</p>`;
const BODY_TD = (inner, top) =>
  `<tr>\n                <td class="card-pad sans" style="padding:${top}px 48px 0; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; line-height:1.7; color:#2F3E34;">\n                  ${inner}\n                </td>\n              </tr>`;
const BUTTON = (b) =>
  `<tr>\n                <td class="card-pad" style="padding:28px 48px 0;">\n                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">\n                    <tr>\n                      <td class="btn-td" align="center" style="background:#2F3E34; border-radius:4px;">\n                        <a class="btn-a sans" href="${b.href}" style="display:inline-block; padding:15px 28px; font-family:'Satoshi','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; font-weight:700; line-height:1.2; color:#FFFFFF; text-decoration:none; letter-spacing:0.01em;">${escape(b.label)}</a>\n                      </td>\n                    </tr>\n                  </table>\n                </td>\n              </tr>`;

export function renderBody(key, text) {
  const button = BUTTONS[key];
  let paragraphs = text.trim().split(/\n\s*\n/).map((p) => p.trim());
  // Drop the sign-off; the template carries it.
  const tail = paragraphs.length - 1;
  if (/^Warmly,\n/.test(paragraphs[tail]) || paragraphs[tail] === "Warmly,") {
    paragraphs = paragraphs.slice(0, tail);
    while (["Tori", "Silver & Salt Capital"].includes(paragraphs[paragraphs.length - 1])) paragraphs.pop();
  }
  // Build blocks: runs of paragraphs, with the button placed where its URL sat.
  const blocks = [];
  let run = [];
  const flush = () => { if (run.length) { blocks.push({ type: "text", paragraphs: run }); run = []; } };
  for (const p of paragraphs) {
    // A URL on its own last line, or "…here: URL" on one line, becomes the button.
    const lines = p.split("\n");
    const last = lines[lines.length - 1];
    const oneLine = lines.length === 1 ? last.match(/^(.*?):\s*(https?:\/\/\S+|\{\{[a-zA-Z]+Url\}\})$/) : null;
    if (button && (URL_RE.test(last) || oneLine)) {
      const lead = (oneLine ? oneLine[1] : lines.slice(0, -1).join(" ")).replace(/:$/, "").trim();
      if (lead && !/here$/i.test(lead)) run.push(lead + ".");
      flush();
      blocks.push({ type: "button" });
      continue;
    }
    const filled = p.replace(/\{\{(commitmentText|normsText|refundPolicyText|startAt|firstName|purchaserName)\}\}/g, (_, k) => GROUP_TEXT[k]);
    run.push(filled.replace(/\n/g, " "));
    if (button?.after && button.after.test(p)) { flush(); blocks.push({ type: "button" }); }
  }
  flush();
  if (button && !blocks.some((b) => b.type === "button")) blocks.push({ type: "button" });

  let first = true;
  return blocks.map((b) => {
    if (b.type === "button") return BUTTON(button);
    const top = first ? 24 : 28;
    first = false;
    return BODY_TD(b.paragraphs.map((p, i) => P(inline(p), i === b.paragraphs.length - 1)).join("\n                  "), top);
  }).join("\n\n              ");
}

export function renderEmail(template, key, email) {
  const noHeading = /^none$/i.test(email.heading);
  const heading = noHeading ? "" : email.heading || email.subject;
  let html = template;
  const replaceOnce = (from, to) => {
    if (!html.includes(from)) throw new Error(`template is missing the marker: ${from.slice(0, 60)}`);
    html = html.replace(from, () => to);
  };
  replaceOnce("Our 20-minute call is on the calendar, and here is what to expect.", brand(email.preheader || email.subject));
  if (noHeading) {
    // Drop the heading row and open the body a little lower under the hairline.
    html = html.replace(/\s*<!-- 2\. Heading:[^]*?<\/tr>/, "");
  } else {
    replaceOnce("Your 20-minute call is set.", brand(heading));
  }
  replaceOnce("<title>Silver &amp; Salt Capital</title>", `<title>${escape(email.subject)}</title>`);
  // Everything between the body marker and the sign-off marker is the sample body.
  const start = html.indexOf("<!-- 3. Body -->");
  const end = html.indexOf("<!-- 5. Sign-off -->");
  if (start < 0 || end < 0) throw new Error("template body markers not found");
  html = html.slice(0, start) + "<!-- 3. Body -->\n              " + renderBody(key, email.text) + "\n\n              " + html.slice(end);
  // Transactional sends carry no unsubscribe link.
  html = html.replace(/\s*&nbsp;&middot;&nbsp;\s*<!-- Keep the unsubscribe link[^\n]*\n\s*<a href="\{\{unsubscribeUrl\}\}"[^\n]*<\/a>/, "");
  // Without a heading, the body opens a little lower under the hairline.
  if (noHeading) html = html.replace("padding:24px 48px 0;", "padding:36px 48px 0;");
  return html;
}

const markdown = readFileSync(SOURCE, "utf8");
const template = readFileSync(TEMPLATE, "utf8");
const emails = parseSections(markdown);
mkdirSync(OUT_DIR, { recursive: true });

const rows = [];
for (const key of MEMBER_KEYS) {
  const email = emails[key];
  if (!email) { console.log(`- ${key}: no section in the file, skipped`); continue; }
  const html = renderEmail(template, key, email);
  writeFileSync(new URL(`${key}.html`, OUT_DIR), html);
  const heading = /^none$/i.test(email.heading) ? "(none)" : email.heading || email.subject;
  const n = heading === "(none)" ? 0 : heading.length;
  const flag = heading === "(none)" ? "ok" : !email.heading ? "no Heading line, subject used" : n > HEADING_LIMIT ? `OVER by ${n - HEADING_LIMIT}` : "ok";
  // Preheader: 40 to 90 characters, measured with sample text in place of placeholders.
  const preLen = email.preheader.replace(/\{\{purchaserName\}\}/g, "Lauren Sercu").replace(/\{\{firstName\}\}/g, "Martha").length;
  const pre = !email.preheader ? "missing" : preLen < 40 ? `${preLen} chars (SHORT, 40 min)` : preLen > 90 ? `${preLen} chars (LONG, 90 max)` : `${preLen} chars`;
  rows.push({ key, enabled: email.enabled, subject: email.subject, heading, n, flag, pre });
}

const index = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Signup emails, rendered</title>
<style>body{font-family:Helvetica,Arial,sans-serif;background:#F2F4F3;color:#2F3E34;margin:0;padding:32px}h1{font-weight:600;font-size:20px}table{border-collapse:collapse;background:#fff;border:1px solid #E1E5E3}td,th{padding:10px 14px;text-align:left;border-bottom:1px solid #E1E5E3;font-size:14px;vertical-align:top}th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7E8E84}a{color:#2F3E34}.warn{color:#D16B4F;font-weight:700}</style></head>
<body><h1>Signup emails, rendered in the template</h1>
<p>Generated by <code>_scripts/render-signup-emails.mjs</code> from <code>_reference/signup-emails.md</code>. Heading limit ${HEADING_LIMIT} characters. Admin notices to Tori stay plain text and are not rendered.</p>
<table><tr><th>Email</th><th>Sends</th><th>Subject</th><th>Heading</th><th>Count</th><th>Preheader</th></tr>
${rows.map((r) => `<tr><td><a href="${r.key}.html">${r.key}</a></td><td>${r.enabled ? "yes" : "off"}</td><td>${escape(r.subject)}</td><td>${escape(r.heading)}</td><td class="${r.flag === "ok" ? "" : "warn"}">${r.n} (${r.flag})</td><td class="${/missing|SHORT|LONG/.test(r.pre) ? "warn" : ""}">${r.pre}</td></tr>`).join("\n")}
</table></body></html>`;
writeFileSync(new URL("index.html", OUT_DIR), index);

console.log(`\nRendered ${rows.length} emails into _reference/signup-emails-html/\n`);
console.log("key".padEnd(22) + "heading".padEnd(36) + "count  preheader");
for (const r of rows) console.log(r.key.padEnd(22) + r.heading.slice(0, 34).padEnd(36) + `${String(r.n).padEnd(3)} ${r.flag.padEnd(12)} ${r.pre}`);
