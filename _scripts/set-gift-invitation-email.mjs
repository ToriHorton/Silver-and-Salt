#!/usr/bin/env node
// Install the gift-membership invitation email (template namedSeatInvitation)
// on a tenant's group row.
//
// Why: Chapter falls back to its own wording ("{{purchaserName}} invited you
// to {{chapterName}}", "Your seat is already paid for") when the row has no
// namedSeatInvitation template. The membership is a gift from a mother to a
// daughter or a daughter to a mother (Tori, 2026-09-19), so the row carries
// wording that says so. Chapter requires the body to mention
// {{purchaserName}}; it prepends a line otherwise.
//
// Variables the send path fills: firstName (the recipient's name as typed by
// the giver, so it may be a full name), purchaserName, chapterName, acceptBy
// (YYYY-MM-DD), joinUrl.
//
// Usage (read-only unless --apply):
//   node _scripts/set-gift-invitation-email.mjs dev
//   node _scripts/set-gift-invitation-email.mjs prod --apply

import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";

const GROUP_ID = "silver-and-salt-capital";
const envName = process.argv[2];
const apply = process.argv.includes("--apply");
if (!["dev", "prod"].includes(envName)) throw new Error("usage: set-gift-invitation-email.mjs <dev|prod> [--apply]");

const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
if (!env?.dbKey || !env?.tenantId) throw new Error(`no cached ${envName} credentials`);
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

export const GIFT_INVITATION = {
  subject: "{{purchaserName}} has given you a membership at {{chapterName}}",
  text:
    "Dear {{firstName}},\n\n" +
    "{{purchaserName}} has given you a membership at {{chapterName}}, a community of women who talk about money out loud. " +
    "Your membership is already paid for.\n\n" +
    "Accept your gift here:\n{{joinUrl}}\n\n" +
    "You will complete your own short application and book a 20-minute introduction call. You will not be asked to pay.\n\n" +
    "Warmly,\nSilver & Salt Capital",
  enabled: true,
};

const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
const row = groups?.[0];
if (!row) throw new Error(`group ${GROUP_ID} not found on ${envName}`);
console.log(`[${envName}] current namedSeatInvitation:`);
console.log(JSON.stringify(row.emailTemplates?.namedSeatInvitation ?? null, null, 2));
console.log(`\n[${envName}] proposed namedSeatInvitation:`);
console.log(JSON.stringify(GIFT_INVITATION, null, 2));

if (!apply) {
  console.log("\n(dry run; pass --apply to write)");
  process.exit(0);
}

const emailTemplates = { ...(row.emailTemplates ?? {}), namedSeatInvitation: GIFT_INVITATION };
await db.transact(
  [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: GROUP_ID }, attrs: { emailTemplates } }],
  { mutationId: `gift-invitation-email-2026-09-19:${envName}` },
);
const after = (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
console.log(`\n[${envName}] stored subject now: ${after?.emailTemplates?.namedSeatInvitation?.subject}`);
