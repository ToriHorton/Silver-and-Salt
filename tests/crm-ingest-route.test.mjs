// POST /api/crm-ingest as production mounts it (src/crm-ingest-route.ts).
// The mapping itself is covered by crm-ingest.test.mjs; this holds the door:
// the route is mounted, fails closed, and hands a valid batch to ingestBatch.

import { describe, expect, it, vi } from "vitest";

vi.mock("../src/crm-ingest.mjs", () => ({
  ingestBatch: vi.fn(async () => ({ created: 1, errors: [] })),
}));

const { crmIngestRoute } = await import("../src/crm-ingest-route.ts");
const { chapterWorkerOptions } = await import("../src/worker-chapter.ts");
const { ingestBatch } = await import("../src/crm-ingest.mjs");

const SECRET = "s3cret";
const ctx = { makeDb: () => ({}) };
const call = (init = {}, env = { CRM_INGEST_SECRET: SECRET }, path = "/api/crm-ingest") => {
  const url = new URL(`https://example.test${path}`);
  return crmIngestRoute(new Request(url, init), url, env, ctx);
};
const post = (headers, body = "{}") => ({ method: "POST", headers, body });

describe("crmIngestRoute", () => {
  it("is mounted on the production Worker", () => {
    expect(chapterWorkerOptions("prod").routes).toContain(crmIngestRoute);
  });

  it("ignores other paths", async () => {
    expect(await call({}, undefined, "/api/crm")).toBeNull();
  });

  it("refuses anything but POST", async () => {
    expect((await call()).status).toBe(405);
  });

  it("fails closed without the right secret", async () => {
    expect((await call(post({}))).status).toBe(401);
    expect((await call(post({ authorization: "Bearer wrong" }))).status).toBe(401);
    expect((await call(post({ authorization: `Bearer ${SECRET}` }), {})).status).toBe(401);
    expect(ingestBatch).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    expect((await call(post({ authorization: `Bearer ${SECRET}` }, "nope"))).status).toBe(400);
  });

  it("hands a valid batch to ingestBatch", async () => {
    const res = await call(post({ authorization: `Bearer ${SECRET}` }, '{"meetings":[]}'));
    expect(res.status).toBe(200);
    expect(ingestBatch).toHaveBeenCalledWith({}, { meetings: [] });
  });
});
