import { describe, expect, it, vi } from "vitest";
import { checkDeployedSchema, compareSchema } from "../_scripts/check-deployed-schema.mjs";

const schema = { entities: { applications: { attrs: { email: { type: "string", unique: true }, newField: { type: "boolean", optional: true } } } }, links: {} };
const config = { app: { id: "chapter-test" }, envs: ["dev"], dbEndpoint: "https://db.example.test", integrations: [{ schema }] };
const credentials = { appId: "chapter-test", dbEndpoint: config.dbEndpoint, envs: { dev: { tenantId: "chapter-test--dev", dbKey: "never-print-me" } } };
const response = (body) => new Response(JSON.stringify(body), { status: 200 });

describe("metadata-only deployed schema gate", () => {
  it("reads only the exact dev schema, without exporting or querying records", async () => {
    const fetcher = vi.fn(async () => response({ schema, status: { mode: "strict" } }));
    expect(await checkDeployedSchema({ config, credentials, env: "dev", fetcher })).toEqual({ missing: [], changed: [], mode: "strict", expectedNamespaces: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://db.example.test/app/chapter-test--dev/schema", expect.objectContaining({ redirect: "error", headers: { Authorization: "Bearer never-print-me" } }));
  });
  it("detects missing attributes even when all namespaces exist", () => {
    expect(compareSchema(schema, { entities: { applications: { attrs: { email: schema.entities.applications.attrs.email } } } }).missing).toEqual(["applications.newField"]);
  });
  it("detects type/uniqueness changes and missing links", () => {
    const actual = structuredClone(schema);
    actual.entities.applications.attrs.email.unique = false;
    expect(compareSchema({ ...schema, links: { person: { forward: { on: "applications", has: "one", label: "person" } } } }, actual)).toEqual({ missing: ["link:person"], changed: ["applications.email"] });
  });
  it("does not treat service-owned namespaces as app schema removals", () => {
    expect(compareSchema(schema, { ...schema, entities: { ...schema.entities, calendar_connection: { attrs: {} }, $users: { attrs: {} } } })).toEqual({ missing: [], changed: [] });
  });
  it.each([
    ["wrong app", { ...credentials, appId: "sibling" }, "dev"],
    ["wrong tenant", { ...credentials, envs: { dev: { dbKey: "secret", tenantId: "chapter-test" } } }, "dev"],
    ["unconfigured production", credentials, "prod"],
    ["wrong endpoint", { ...credentials, dbEndpoint: "https://sibling.example.test" }, "dev"],
  ])("rejects %s without fetching", async (_name, creds, env) => {
    const fetcher = vi.fn();
    await expect(checkDeployedSchema({ config, credentials: creds, env, fetcher })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not echo provider error bodies", async () => {
    await expect(checkDeployedSchema({ config, credentials, env: "dev", fetcher: async () => new Response("never-print-me", { status: 403 }) })).rejects.toThrow(/^Schema metadata request returned HTTP 403;/);
  });
  it("reports transport failure without disclosing credentials", async () => {
    await expect(checkDeployedSchema({ config, credentials, env: "dev", fetcher: async () => { throw Error("never-print-me"); } })).rejects.toThrow(/^Schema metadata request failed;/);
  });
});
