import type { Route } from "@odla-ai/chapter/worker";

const START = "<!-- membership-holding:start -->";
const END = "<!-- membership-holding:end -->";
const DEV_ORIGIN = "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev";

/** Rehearse the existing join island on Cory dev without opening production. */
export const devJoin: Route = async (req, url, env) => {
  if (url.origin !== DEV_ORIGIN || env.ODLA_ENV !== "dev" || env.ODLA_RUNTIME !== "cory"
    || env.ODLA_APP_ID !== "silver-and-salt-capital"
    || env.ODLA_TENANT !== "silver-and-salt-capital--dev"
    || !["/join", "/join/", "/join.html"].includes(url.pathname)
    || !["GET", "HEAD"].includes(req.method)) return null;

  // Ask the assets binding, never public fetch back into this same Worker.
  const asset = await env.ASSETS.fetch(new Request(req, { method: "GET" }));
  if (asset.status !== 200 || !asset.headers.get("content-type")?.includes("text/html")) return asset;
  const html = await asset.text();
  const start = html.indexOf(START), end = html.indexOf(END);
  if (start < 0 || end <= start || html.indexOf(START, start + START.length) !== -1
    || html.indexOf(END, end + END.length) !== -1) {
    return new Response(req.method === "HEAD" ? null : "Dev signup entry is unavailable.", {
      status: 503, headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
  const body = html.slice(0, start)
    + '<div id="join-root"><p role="status">Loading the application form…</p></div>'
    + '<script type="module" src="/assets/app/join-island.js"></script>'
    + html.slice(end + END.length);
  const headers = new Headers(asset.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.delete("last-modified");
  headers.set("cache-control", "no-store");
  return new Response(req.method === "HEAD" ? null : body.replace(
    "We look forward to welcoming you to our investor community. Memberships open soon.",
    "Development rehearsal — use test identities and Stripe test payments only.",
  ), { status: 200, headers });
};
