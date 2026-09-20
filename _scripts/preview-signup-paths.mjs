// Read-only: classify every application on each tenant the way src/signup-paths.ts does.
// the way src/signup-paths.ts does, and count how many reminders are due.
// Usage: node _scripts/preview-signup-paths.mjs
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
import { classifyPath, loadSignupPaths, paidAtOf, REMINDER_AFTER_MS } from "../src/signup-paths.ts";
const creds = JSON.parse(readFileSync("/Users/tori/Projects/Silver-and-Salt/.odla/credentials.local.json", "utf8"));
for (const envName of ["dev", "prod"]) {
  const env = creds.envs[envName];
  const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
  for (const runtime of envName === "dev" ? ["tori", "cory"] : ["live"]) {
    const { rows, facts } = await loadSignupPaths(db, "silver-and-salt-capital", runtime);
    const now = Date.now();
    const counts = {};
    let due = 0;
    for (const app of rows) {
      const p = classifyPath(app, facts); counts[p] = (counts[p] ?? 0) + 1;
      const paidAt = paidAtOf(app, facts);
      if (p === "awaiting_booking" && paidAt !== null && paidAt + REMINDER_AFTER_MS <= now) due++;
    }
    console.log(`[${envName}/${runtime}] applications=${rows.length} scheduled=${facts.scheduled.size} receipts=${facts.paidAt.size} reminded=${facts.reminded.size}`, counts, `reminders due now=${due}`);
  }
}
