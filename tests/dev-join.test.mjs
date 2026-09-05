import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { devJoin } from "../src/dev-join";

const origin = "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev";
const html = readFileSync("join.html", "utf8");
const binding = (body = html) => ({ fetch: vi.fn(async () => new Response(body, {
  headers: { "content-type": "text/html", etag: '"original"', "content-length": "1" },
})) });
const environment = (ASSETS = binding()) => ({ ASSETS, ODLA_ENV: "dev", ODLA_RUNTIME: "cory",
  ODLA_APP_ID: "silver-and-salt-capital", ODLA_TENANT: "silver-and-salt-capital--dev" });
const run = (env, path = "/join?tier=steward", method = "GET", base = origin) => {
  const url = new URL(path, base);
  return devJoin(new Request(url, { method }), url, env, {});
};

describe("dev-only join entry", () => {
  it.each(["/join", "/join/", "/join.html"])("mounts the real island at %s with the requested tier intact", async (path) => {
    const env = environment();
    const res = await run(env, `${path}?tier=steward`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('id="join-root"');
    expect(body).toContain('src="/assets/app/join-island.js"');
    expect(body).not.toContain('id="coming-soon"');
    expect(body).toContain("Development rehearsal");
    expect(env.ASSETS.fetch.mock.calls[0][0].url).toBe(`${origin}${path}?tier=steward`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.has("etag")).toBe(false);
    expect(res.headers.has("content-length")).toBe(false);
  });

  it.each([
    { ODLA_ENV: "prod" }, { ODLA_RUNTIME: "tori" }, { ODLA_RUNTIME: "live" },
    { ODLA_RUNTIME: undefined }, { ODLA_APP_ID: "other" }, { ODLA_TENANT: "other" },
  ])("does not enable signup outside the reviewed runtime: %j", async (override) => {
    const env = { ...environment(), ...override };
    expect(await run(env)).toBeNull();
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("preserves the production holding document and rejects other hosts, routes and methods", async () => {
    const env = environment();
    expect(html).toContain('id="coming-soon"');
    expect(html).not.toContain('id="join-root"');
    expect(html).not.toContain('src="/assets/app/join-island.js"');
    expect(await run(env, "/join", "GET", "https://silverandsaltcapital.com")).toBeNull();
    expect(await run(env, "/api/join-config")).toBeNull();
    expect(await run(env, "/join", "POST")).toBeNull();
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    const config = readFileSync("wrangler.jsonc", "utf8");
    expect(config.indexOf('"run_worker_first"')).toBeGreaterThan(config.indexOf('"env"'));
    expect(config.match(/"run_worker_first"/g)).toHaveLength(1);
  });

  it("preserves asset redirects and fails closed if the holding marker contract drifts", async () => {
    const env = environment({ fetch: async () => Response.redirect(`${origin}/join`, 307) });
    expect((await run(env, "/join.html")).status).toBe(307);
    for (const body of ["missing", html.replace("<!-- membership-holding:end -->", ""), html + "<!-- membership-holding:start -->"]) {
      expect((await run(environment(binding(body)))).status).toBe(503);
    }
  });

  it("answers HEAD without a body", async () => {
    const res = await run(environment(), "/join", "HEAD");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});
