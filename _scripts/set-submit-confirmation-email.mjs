#!/usr/bin/env node
// Install the application receipt email (template submitConfirmation) on a
// tenant's group row.
//
// Why: Chapter 0.52.0 (odla-ai PR #978) confirms receipt to the applicant at
// submit. On this site that is the free Associate path, and only that path:
// the receipt goes to a free tier always, and to a paid tier only when the
// paymentConfirmation template is disabled, so a paid applicant is confirmed
// once, by payment. Chapter seeds its own wording ("Thanks for applying to
// Silver & Salt Capital.") into a fresh row and falls back to it when the row
// has no submitConfirmation; this script puts the site's wording on the
// existing rows. The seed is insert-only, so it never overwrites this.
//
// Variables the send path fills: firstName, tierName ("Associate Member"),
// submitNextStep ("Next, schedule your introduction call." on the booking
// path, "Your membership is approved." when Tori waived the call), and
// membersUrl (this deployment's /members/).
//
// Usage (read-only unless --apply):
//   node _scripts/set-submit-confirmation-email.mjs dev
//   node _scripts/set-submit-confirmation-email.mjs prod --apply
//
// Idempotent: the merge is keyed by mutationId, and only submitConfirmation
// changes; every other template on the row is left exactly as stored.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initAdmin } from "@odla-ai/db";

const GROUP_ID = "silver-and-salt-capital";
const REVISION = "submit-confirmation-email-2026-09-20";

export const SUBMIT_CONFIRMATION = {
  subject: "We received your application to Silver & Salt Capital",
  text:
    "Hi {{firstName}},\n\n" +
    "Thank you for applying to Silver & Salt Capital. We have your {{tierName}} application. {{submitNextStep}}\n\n" +
    "Your member area, with your application and its next step, is here:\n" +
    "{{membersUrl}}\n\n" +
    "Warmly,\nSilver & Salt Capital",
  enabled: true,
};

async function main() {
  const envName = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!["dev", "prod"].includes(envName)) throw new Error("usage: set-submit-confirmation-email.mjs <dev|prod> [--apply]");

  const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
  const env = creds.envs?.[envName];
  if (!env?.dbKey || !env?.tenantId) throw new Error(`no cached ${envName} credentials`);
  const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

  const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
  const row = groups?.[0];
  if (!row) throw new Error(`group ${GROUP_ID} not found on ${envName}`);
  console.log(`[${envName}] current submitConfirmation:`);
  console.log(JSON.stringify(row.emailTemplates?.submitConfirmation ?? null, null, 2));
  console.log(`\n[${envName}] proposed submitConfirmation:`);
  console.log(JSON.stringify(SUBMIT_CONFIRMATION, null, 2));

  if (!apply) {
    console.log("\n(dry run; pass --apply to write)");
    return;
  }

  const emailTemplates = { ...(row.emailTemplates ?? {}), submitConfirmation: SUBMIT_CONFIRMATION };
  await db.transact(
    [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: GROUP_ID }, attrs: { emailTemplates } }],
    { mutationId: `${REVISION}:${envName}` },
  );
  const after = (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
  console.log(`\n[${envName}] stored subject now: ${after?.emailTemplates?.submitConfirmation?.subject}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
