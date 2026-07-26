#!/usr/bin/env node
// Does the DEPLOYED tenant schema declare everything the INSTALLED Chapter
// engine will try to write?
//
// Why this exists. odla-db is schema_strict_v1: a write to an undeclared attr
// is rejected. Chapter's provisioning path wraps that write in an empty
// `catch {}`, so the rejection is invisible — the symptom is a field that is
// silently never populated, with no error anywhere.
//
// That is exactly how `clerkPrivateMetadataSyncedAt` went missing here: the
// attr arrived in @odla-ai/chapter 0.25.x, tests/chapter-parity.test.mjs
// correctly reported it as a new addition, but the tenant was never
// re-provisioned, so every applicant silently lost the stamp until this was
// diagnosed. The lesson the parity test alone could not teach: a reviewed
// schema addition is a DEPLOYMENT step, not just a documentation step.
//
// Run after any @odla-ai/* upgrade, and after any change to
// src/chapter.config.mjs:
//     npm run check:schema
// A non-zero exit means: run `npx @odla-ai/cli provision --yes`.

import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { readFileSync, rmSync } from "node:fs";
import { createChapterIntegration } from "@odla-ai/chapter";
import { chapter } from "../src/chapter.config.mjs";

const ENV = process.argv[2] ?? "dev";
const OUT = `/tmp/odla-schema-check-${ENV}.jsonl.gz`;

console.log(`checking deployed ${ENV} tenant against the installed engine…`);
try {
  execFileSync(
    "npx",
    ["@odla-ai/cli", "app", "export", "--env", ENV, "--fresh", "--out", OUT],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
} catch (err) {
  // Exit 75 is the odla CLI's "device handshake still pending" code: the local
  // token expired and a human has to approve a code in Studio. That is not a
  // schema failure, and reporting it as one (or as a raw Node stack trace)
  // sends whoever runs this looking in entirely the wrong place.
  if (err?.status === 75) {
    console.error(
      "\n  Cannot check: this terminal is not signed in to odla.\n" +
        "  The command above prints an approval code and a Studio URL —\n" +
        "  approve it, then re-run `npm run check:schema`.\n" +
        "  The schema itself has NOT been checked either way.\n",
    );
    process.exit(75);
  }
  console.error(`\n  Could not export the ${ENV} tenant (exit ${err?.status ?? "?"}).`);
  console.error("  The schema has NOT been checked.\n");
  process.exit(2);
}

const lines = gunzipSync(readFileSync(OUT)).toString("utf8").split("\n");
let deployed = null;
let strict = false;
for (const line of lines) {
  if (!line.trim()) continue;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  if (row.t !== "meta") continue;
  if (row.key === "schema") deployed = JSON.parse(row.value).entities;
  if (row.key === "schema_strict_v1") strict = row.value === "true";
}
rmSync(OUT, { force: true });

if (!deployed) {
  console.error("could not read the deployed schema from the snapshot");
  process.exit(2);
}

const expected = createChapterIntegration(chapter, { basePath: "/api/crm" }).schema.entities;
const missing = [];
for (const [ns, def] of Object.entries(expected)) {
  const live = deployed[ns]?.attrs;
  if (!live) {
    missing.push(`${ns} (entire namespace)`);
    continue;
  }
  for (const attr of Object.keys(def.attrs ?? {})) {
    if (!(attr in live)) missing.push(`${ns}.${attr}`);
  }
}

console.log(`  strict schema: ${strict}`);
console.log(`  namespaces expected: ${Object.keys(expected).length}`);

if (missing.length === 0) {
  console.log("  ✓ deployed tenant declares every attribute the engine writes");
  process.exit(0);
}

console.error(`\n  ✗ ${missing.length} attribute(s) the engine writes are NOT declared on the tenant:`);
for (const m of missing) console.error(`      ${m}`);
console.error(
  strict
    ? "\n  The tenant is schema-strict, so these writes are REJECTED — and Chapter\n" +
        "  swallows the rejection, so the field just silently stays empty.\n" +
        "  Fix: npx @odla-ai/cli provision --yes\n"
    : "\n  Fix: npx @odla-ai/cli provision --yes\n",
);
process.exit(1);
