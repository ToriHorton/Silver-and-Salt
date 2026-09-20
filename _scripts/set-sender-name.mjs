#!/usr/bin/env node
// Set the sender display name (groups.fromName) on a tenant's group row.
//
// Why: Chapter 0.52.0 (odla-ai PR #978, bug 5a50304f) puts a display name on
// the From header, so mail arrives as "Tori Horton <tori@silverandsaltcapital
// .com>" while the address stays the Worker's EMAIL_FROM. defineChapter seeds
// the name with the group row, but the seed is insert-only and both tenants
// already have their row, so the existing rows get it from here. The value is
// read from src/chapter.config.mjs so the config and the row cannot disagree.
// Owner-editable afterwards in Settings → Email.
//
// Usage (read-only unless --apply):
//   node _scripts/set-sender-name.mjs dev
//   node _scripts/set-sender-name.mjs prod --apply

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initAdmin } from "@odla-ai/db";
import { chapter } from "../src/chapter.config.mjs";

const GROUP_ID = "silver-and-salt-capital";
const REVISION = "sender-name-2026-09-20";

export const FROM_NAME = chapter.config.emails.fromName;

async function main() {
  const envName = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!["dev", "prod"].includes(envName)) throw new Error("usage: set-sender-name.mjs <dev|prod> [--apply]");
  if (typeof FROM_NAME !== "string" || !FROM_NAME.trim()) throw new Error("src/chapter.config.mjs declares no emails.fromName");

  const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
  const env = creds.envs?.[envName];
  if (!env?.dbKey || !env?.tenantId) throw new Error(`no cached ${envName} credentials`);
  const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

  const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
  const row = groups?.[0];
  if (!row) throw new Error(`group ${GROUP_ID} not found on ${envName}`);
  console.log(`[${envName}] current fromName: ${JSON.stringify(row.fromName ?? null)}`);
  console.log(`[${envName}] proposed fromName: ${JSON.stringify(FROM_NAME)}`);

  if (!apply) {
    console.log("\n(dry run; pass --apply to write)");
    return;
  }

  await db.transact(
    [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: GROUP_ID }, attrs: { fromName: FROM_NAME } }],
    { mutationId: `${REVISION}:${envName}` },
  );
  const after = (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
  console.log(`\n[${envName}] stored fromName now: ${JSON.stringify(after?.fromName ?? null)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
