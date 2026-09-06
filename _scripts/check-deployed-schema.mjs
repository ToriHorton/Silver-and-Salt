#!/usr/bin/env node
// Metadata-only deployment gate. Exports intentionally require a human session.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

export function compareSchema(expected, live) {
  if (!live || typeof live !== "object" || !live.entities) throw new Error("Database returned no schema metadata; schema has NOT been checked.");
  const missing = [], changed = [];
  for (const [ns, def] of Object.entries(expected.entities)) {
    const actual = live.entities[ns];
    if (!actual) { missing.push(ns); continue; }
    for (const [attr, definition] of Object.entries(def.attrs ?? {})) {
      if (!(attr in (actual.attrs ?? {}))) missing.push(`${ns}.${attr}`);
      else if (!isDeepStrictEqual(definition, actual.attrs[attr])) changed.push(`${ns}.${attr}`);
    }
  }
  for (const [name, definition] of Object.entries(expected.links ?? {})) {
    if (!(name in (live.links ?? {}))) missing.push(`link:${name}`);
    else if (!isDeepStrictEqual(definition, live.links[name])) changed.push(`link:${name}`);
  }
  return { missing, changed };
}

export async function checkDeployedSchema({ config, credentials, env, fetcher = fetch }) {
  if (!config.envs.includes(env)) throw new Error(`Environment ${env} is not configured; refusing schema read.`);
  if (credentials.appId !== config.app.id) throw new Error("Credentials belong to a different app; refusing schema read.");
  const entry = credentials.envs?.[env];
  const expectedTenant = env === "prod" ? config.app.id : `${config.app.id}--${env}`;
  if (!entry?.dbKey || entry.tenantId !== expectedTenant) throw new Error("Missing or mismatched exact-environment database credentials; schema has NOT been checked.");
  const endpoint = new URL(config.dbEndpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/") throw new Error("Schema check requires the configured HTTPS database origin.");
  if (credentials.dbEndpoint && new URL(credentials.dbEndpoint).origin !== endpoint.origin) throw new Error("Database credential endpoint does not match config; refusing schema read.");
  let response;
  try {
    response = await fetcher(`${endpoint.origin}/app/${encodeURIComponent(entry.tenantId)}/schema`, {
      headers: { Authorization: `Bearer ${entry.dbKey}` }, redirect: "error", signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error("Schema metadata request failed; schema has NOT been checked."); }
  // Never include remote bodies or credentials in diagnostic output.
  if (!response.ok) throw new Error(`Schema metadata request returned HTTP ${response.status}; schema has NOT been checked.`);
  let payload;
  try { payload = await response.json(); } catch { throw new Error("Invalid schema metadata response."); }
  const expected = { entities: {}, links: {} };
  for (const integration of config.integrations) {
    Object.assign(expected.entities, integration.schema?.entities ?? {});
    Object.assign(expected.links, integration.schema?.links ?? {});
  }
  return { ...compareSchema(expected, payload.schema), mode: payload.status?.mode ?? "unknown", expectedNamespaces: Object.keys(expected.entities).length };
}

async function main() {
  const configPath = resolve(dirname(fileURLToPath(import.meta.url)), "../odla.config.mjs");
  const { default: config } = await import(pathToFileURL(configPath).href);
  const env = process.argv[2] ?? "dev";
  const credentialPath = config.local?.credentialsFile
    ? resolve(dirname(configPath), config.local.credentialsFile)
    : resolve(process.env.ODLA_HOME ?? resolve(homedir(), ".odla"), "apps", config.app.id, "credentials.json");
  let credentials;
  try { credentials = JSON.parse(readFileSync(credentialPath, "utf8")); }
  catch { throw new Error("Existing local database credentials unavailable; schema has NOT been checked."); }
  const result = await checkDeployedSchema({ config, credentials, env });
  console.log(`Schema ${config.app.id}/${env}: ${result.mode}; ${result.expectedNamespaces} expected namespaces`);
  for (const field of result.missing) console.error(`  missing: ${field}`);
  for (const field of result.changed) console.error(`  definition differs: ${field}`);
  if (result.missing.length || result.changed.length || result.mode !== "strict") {
    console.error("Deployment gate failed. Review the exact schema delta before applying the approved dev provision procedure.");
    process.exitCode = 1;
  } else console.log("ok: deployed metadata matches every installed field and link (no records exported)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 2; });
}
