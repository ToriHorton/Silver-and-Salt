#!/usr/bin/env node
// Install the signup email templates from _reference/signup-emails.md onto a
// tenant's group row. That Markdown file is the single place the copy is
// reviewed and edited (Tori, 2026-09-19); this script only carries it over.
//
// File format the parser expects, per template:
//   ## <templateKey>
//   ...any notes...
//   **Enabled:** no          (optional; keeps the template on file, unsent)
//   **Subject:** one line
//   ```text
//   the body, with {{placeholders}}
//   ```
// Template keys: adminNotification, paymentConfirmation, prepEmail,
// onboardingInvite, namedSeatInvitation, bookingReminder, bookingReminderAdmin,
// callBookedAdmin, paidApprovedAdmin, and from Chapter 0.52.0 submitConfirmation
// (the free Associate's receipt) and seatAccepted (the giver's notice when her
// gift is accepted). Sections whose heading is anything else are ignored, so
// the file can carry commentary freely.
//
// Chapter 0.52.0 fills these placeholders from stored data (blank when the
// value does not exist yet): prepEmail gets {{startAt}}, {{endAt}},
// {{timezone}}, {{meetUrl}}, {{htmlLink}}, {{tierName}}, {{paymentAmount}} and
// {{paymentAmountSummary}}; submitConfirmation gets {{tierName}},
// {{submitNextStep}} and {{membersUrl}}; adminNotification gets {{tier}} and
// {{adminUrl}}; seatAccepted gets {{recipientName}}, {{tierName}} and
// {{chapterName}}. An unknown placeholder renders empty, so check the name.
//
// Usage (read-only unless --apply):
//   node _scripts/set-signup-emails.mjs dev
//   node _scripts/set-signup-emails.mjs prod --apply
//   node _scripts/set-signup-emails.mjs prod --only prepEmail --apply
//
// Idempotent: keyed by mutationId per file content hash. Every template the
// file does not define is left exactly as stored.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";

const GROUP_ID = "silver-and-salt-capital";
const KEYS = ["adminNotification", "paymentConfirmation", "prepEmail", "onboardingInvite", "namedSeatInvitation", "bookingReminder", "bookingReminderAdmin", "callBookedAdmin", "paidApprovedAdmin", "submitConfirmation", "seatAccepted", "bookingReminderFree", "paymentReminder"];
const SOURCE = new URL("../_reference/signup-emails.md", import.meta.url);

const args = process.argv.slice(2);
const envName = args[0];
const apply = args.includes("--apply");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
if (!["dev", "prod"].includes(envName)) throw new Error("usage: set-signup-emails.mjs <dev|prod> [--only <key>] [--apply]");
if (only && !KEYS.includes(only)) throw new Error(`--only must be one of ${KEYS.join(", ")}`);

export function parseTemplates(markdown) {
  const out = {};
  const sections = markdown.split(/^## /m).slice(1);
  for (const section of sections) {
    const key = section.split("\n", 1)[0].trim();
    if (!KEYS.includes(key)) continue;
    const subject = section.match(/^\*\*Subject:\*\*\s*(.+?)\s*$/m)?.[1];
    const body = section.match(/```text\r?\n([\s\S]*?)\r?\n```/)?.[1];
    if (!subject || body === undefined) throw new Error(`section "${key}" needs a **Subject:** line and a \`\`\`text body block`);
    if (/[–—]/.test(subject + body)) throw new Error(`section "${key}" contains an em or en dash (brand rule 4)`);
    if (/Silver and Salt/i.test(subject + body)) throw new Error(`section "${key}" spells the name without the ampersand (brand rule 1)`);
    // Anywhere in the section, on its own line or after another bold label.
    // An anchored (^...$) match missed "**Fires:** never. **Enabled:** no" and
    // installed submitConfirmation enabled on production (2026-09-20).
    const enabled = !/\*\*Enabled:\*\*\s*no\b/i.test(section);
    // Double asterisks mark bold for the HTML template; the text send drops them.
    out[key] = { subject, text: body.replace(/\r\n/g, "\n").replace(/\*\*(.+?)\*\*/g, "$1"), enabled };
  }
  return out;
}

const markdown = readFileSync(SOURCE, "utf8");
const proposed = parseTemplates(markdown);
const selected = only ? { [only]: proposed[only] } : proposed;
if (only && !proposed[only]) throw new Error(`the file has no "${only}" section`);

const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
if (!env?.dbKey || !env?.tenantId) throw new Error(`no cached ${envName} credentials`);
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
const row = groups?.[0];
if (!row) throw new Error(`group ${GROUP_ID} not found on ${envName}`);
const stored = row.emailTemplates ?? {};

let changes = 0;
for (const key of Object.keys(selected)) {
  const before = stored[key];
  const after = selected[key];
  const same = before && before.subject === after.subject && before.text === after.text && (before.enabled ?? true) === after.enabled;
  console.log(`\n==== ${key} (${same ? "unchanged" : "will change"}) ====`);
  console.log("--- stored subject:  ", JSON.stringify(before?.subject ?? null));
  console.log("--- stored enabled:  ", JSON.stringify(before ? (before.enabled ?? true) : null));
  console.log("--- proposed subject:", JSON.stringify(after.subject));
  console.log("--- proposed enabled:", JSON.stringify(after.enabled));
  console.log("--- proposed body:\n" + after.text);
  if (!same) changes++;
}

if (!apply) {
  console.log(`\n[${envName}] ${changes} template(s) would change. Dry run; pass --apply to write.`);
  process.exit(0);
}
if (!changes) {
  console.log(`\n[${envName}] nothing to write.`);
  process.exit(0);
}

const emailTemplates = { ...stored, ...selected };
const hash = createHash("sha256").update(JSON.stringify(selected)).digest("hex").slice(0, 16);
await db.transact(
  [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: GROUP_ID }, attrs: { emailTemplates } }],
  { mutationId: `signup-emails:${hash}:${envName}` },
);
const after = (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
for (const key of Object.keys(selected)) console.log(`[${envName}] stored ${key} subject now: ${after?.emailTemplates?.[key]?.subject}`);
