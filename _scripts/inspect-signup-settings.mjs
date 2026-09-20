// Read-only: the group row's signup and email settings on one env, PII redacted.
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
const envName = process.argv[2];
if (!["dev", "prod"].includes(envName)) throw new Error("usage: inspect-signup-settings.mjs <dev|prod>");
const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
const { groups } = await db.query({ groups: { $: { where: { id: "silver-and-salt-capital" }, limit: 1 } } });
const g = groups?.[0];
if (!g) throw new Error("group not found");
const red = (v) => (typeof v === "string" && v.includes("@") ? v.replace(/^[^@]+/, "***") : v);
const out = {};
for (const [k, v] of Object.entries(g)) {
  if (k === "emailTemplates") {
    out.emailTemplates = Object.fromEntries(Object.entries(v ?? {}).map(([t, tpl]) => [t, { enabled: tpl.enabled ?? true, subject: tpl.subject, textChars: (tpl.text ?? "").length }]));
  } else if (typeof v === "string" && v.length > 160) {
    out[k] = v.slice(0, 160) + `… (${v.length} chars)`;
  } else {
    out[k] = red(v);
  }
}
console.log(JSON.stringify(out, null, 2));
