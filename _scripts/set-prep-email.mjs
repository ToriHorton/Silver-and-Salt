#!/usr/bin/env node
// Replace the call-prep email template (prepEmail) on a tenant's group row.
//
// Why: the template Chapter seeds at provisioning reads "Looking forward to
// our call at {{meetingTime}}. {{meetingLink}}", and before Chapter 0.52.0 the
// booking route supplied only {{firstName}}, so both placeholders rendered as
// blanks (journey-map review, 2026-09-17). Chapter 0.52.0 (odla-ai PR #978)
// fills the booking from stored data: {{startAt}} is the booked call in the
// group's scheduling timezone, {{meetUrl}} and {{htmlLink}} are the meeting's
// Google Meet and calendar links, {{tierName}} is the tier applied for, and
// {{paymentAmountSummary}} is " of $900.00" from the frozen checkout, or
// blank for a free Associate and before checkout (booking is allowed from
// "submitted"). The bare {{paymentAmount}} is deliberately not used: it is
// blank in the same two cases and would leave an empty line.
//
// Usage (read-only unless --apply):
//   node _scripts/set-prep-email.mjs dev
//   node _scripts/set-prep-email.mjs prod --apply
//
// Idempotent: the merge is keyed by mutationId, and only prepEmail changes;
// every other template on the row is left exactly as stored. The mutationId
// names this revision of the copy, so re-running an older one is a no-op.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initAdmin } from "@odla-ai/db";

const GROUP_ID = "silver-and-salt-capital";
const REVISION = "prep-email-booking-details-2026-09-20";

export const PREP_EMAIL = {
  subject: "Before your Silver & Salt Capital conversation",
  text:
    "Hi {{firstName}},\n\n" +
    "We look forward to meeting you. Your calendar invitation has the date, the time, and the video call link, and here they are again:\n\n" +
    "When: {{startAt}}\n" +
    "Video call: {{meetUrl}}\n" +
    "Calendar: {{htmlLink}}\n" +
    "Membership: {{tierName}}{{paymentAmountSummary}}\n\n" +
    "Ahead of the call, here is the community commitment every member agrees to, and the norms our community keeps:\n\n" +
    "{{commitmentText}}\n\n" +
    "{{normsText}}\n\n" +
    "Your conversation will include your agreement to the community commitment.\n\n" +
    "Warmly,\nSilver & Salt Capital",
  enabled: true,
};

async function main() {
  const envName = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!["dev", "prod"].includes(envName)) throw new Error("usage: set-prep-email.mjs <dev|prod> [--apply]");

  const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
  const env = creds.envs?.[envName];
  if (!env?.dbKey || !env?.tenantId) throw new Error(`no cached ${envName} credentials`);
  const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

  const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
  const row = groups?.[0];
  if (!row) throw new Error(`group ${GROUP_ID} not found on ${envName}`);
  const current = row.emailTemplates?.prepEmail;
  console.log(`[${envName}] current prepEmail:`);
  console.log(JSON.stringify(current ?? null, null, 2));
  console.log(`\n[${envName}] proposed prepEmail:`);
  console.log(JSON.stringify(PREP_EMAIL, null, 2));

  if (!apply) {
    console.log("\n(dry run; pass --apply to write)");
    return;
  }

  const emailTemplates = { ...(row.emailTemplates ?? {}), prepEmail: PREP_EMAIL };
  await db.transact(
    [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: GROUP_ID }, attrs: { emailTemplates } }],
    { mutationId: `${REVISION}:${envName}` },
  );
  const after = (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
  console.log(`\n[${envName}] stored prepEmail subject now: ${after?.emailTemplates?.prepEmail?.subject}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
