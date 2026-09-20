#!/usr/bin/env node
// Install the gift-accepted notice (template seatAccepted) on a tenant's
// group row.
//
// Why: from Chapter 0.52.0 (odla-ai PR #978) the giver is emailed once when
// the recipient accepts, deduplicated per seat through the email log. Chapter
// falls back to its own wording ("{{recipientName}} accepted your
// {{chapterName}} seat", "the seat you purchased") when the row has no
// seatAccepted template. On this site the membership is a gift from a mother
// to a daughter or a daughter to a mother (Tori, 2026-09-19), and the
// invitation already says so (_scripts/set-gift-invitation-email.mjs), so
// this notice keeps the same words. Owner-editable afterwards in Settings →
// Email, where it can also be switched off.
//
// Variables the send path fills: firstName (the giver), recipientName (as
// the giver typed it), tierName, chapterName.
//
// Usage (read-only unless --apply):
//   node _scripts/set-gift-accepted-email.mjs dev
//   node _scripts/set-gift-accepted-email.mjs prod --apply

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initAdmin } from "@odla-ai/db";

const GROUP_ID = "silver-and-salt-capital";
const REVISION = "gift-accepted-email-2026-09-20";

export const GIFT_ACCEPTED = {
  subject: "{{recipientName}} has accepted your gift",
  text:
    "Dear {{firstName}},\n\n" +
    "{{recipientName}} has accepted the membership you gave her at Silver & Salt Capital and joins as a {{tierName}}. " +
    "She will complete her own short application and book her introduction call from here; nothing more is needed from you.\n\n" +
    "Thank you for bringing her in.\n\n" +
    "Warmly,\nSilver & Salt Capital",
  enabled: true,
};

async function main() {
  const envName = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!["dev", "prod"].includes(envName)) throw new Error("usage: set-gift-accepted-email.mjs <dev|prod> [--apply]");

  const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
  const env = creds.envs?.[envName];
  if (!env?.dbKey || !env?.tenantId) throw new Error(`no cached ${envName} credentials`);
  const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

  const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
  const row = groups?.[0];
  if (!row) throw new Error(`group ${GROUP_ID} not found on ${envName}`);
  console.log(`[${envName}] current seatAccepted:`);
  console.log(JSON.stringify(row.emailTemplates?.seatAccepted ?? null, null, 2));
  console.log(`\n[${envName}] proposed seatAccepted:`);
  console.log(JSON.stringify(GIFT_ACCEPTED, null, 2));

  if (!apply) {
    console.log("\n(dry run; pass --apply to write)");
    return;
  }

  const emailTemplates = { ...(row.emailTemplates ?? {}), seatAccepted: GIFT_ACCEPTED };
  await db.transact(
    [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: GROUP_ID }, attrs: { emailTemplates } }],
    { mutationId: `${REVISION}:${envName}` },
  );
  const after = (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
  console.log(`\n[${envName}] stored subject now: ${after?.emailTemplates?.seatAccepted?.subject}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
