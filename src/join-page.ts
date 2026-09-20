// Serves /join. The tracked join.html is the holding page; when sales are
// open to this request (public, or restricted with the canary cookie) the
// holding block between the two markers is replaced by the Preact join island.
// Otherwise the route falls through and the assets binding serves the page
// unchanged, byte-identical to main.
//
// The gate here is only presentation. The server-side refusal of every
// checkout entry point lives in src/sales-state.ts and applies regardless.

import type { Route } from "@odla-ai/chapter/worker";
import { envNameOf } from "./deployment";
import { canarySetCookie, purchasesOpenFor, resolveSalesState, timingSafeEqual } from "./sales-state";

const START = "<!-- membership-holding:start -->";
const END = "<!-- membership-holding:end -->";
const JOIN_PATHS = ["/join", "/join/", "/join.html"];

export const joinPage: Route = async (req, url, env) => {
  if (!JOIN_PATHS.includes(url.pathname) || !["GET", "HEAD"].includes(req.method)) return null;

  // One-time canary entry: /join?canary=<token> sets the cookie and redirects
  // to a clean URL so the token never lingers in history or referrers.
  const presented = url.searchParams.get("canary");
  if (presented !== null) {
    const { state } = resolveSalesState(env);
    const token = env.SALES_CANARY_TOKEN;
    const clean = new URL(url); clean.searchParams.delete("canary");
    const headers = new Headers({ location: clean.pathname + clean.search, "cache-control": "no-store" });
    if (state === "restricted" && typeof token === "string" && timingSafeEqual(presented, token)) {
      headers.set("set-cookie", canarySetCookie(token, url.protocol === "https:"));
    }
    return new Response(null, { status: 302, headers });
  }

  const prepaidInvitation = /^seat_[A-Za-z0-9_-]{16,128}$/.test(url.searchParams.get("seat") ?? "");
  if (!prepaidInvitation && !purchasesOpenFor(req, env)) return null;

  // Ask the assets binding, never public fetch back into this same Worker.
  const asset = await env.ASSETS.fetch(new Request(req, { method: "GET" }));
  if (asset.status !== 200 || !asset.headers.get("content-type")?.includes("text/html")) return asset;
  const html = await asset.text();
  const start = html.indexOf(START), end = html.indexOf(END);
  if (start < 0 || end <= start || html.indexOf(START, start + START.length) !== -1
    || html.indexOf(END, end + END.length) !== -1) {
    return new Response(req.method === "HEAD" ? null : "The application form is briefly unavailable.", {
      status: 503, headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
  let body = html.slice(0, start)
    + '<div id="join-root"><p role="status">Loading the application form…</p></div>'
    + '<script type="module" src="/assets/app/join-island.js?v=free-resume-0520"></script>'
    + html.slice(end + END.length);
  if (envNameOf(env) === "dev") {
    body = body.replace(
      "We look forward to welcoming you to our investor community. Memberships open soon.",
      "Development rehearsal — use test identities and Stripe test payments only.",
    );
  } else {
    body = body.replace("We look forward to welcoming you to our investor community. Memberships open soon.",
      prepaidInvitation ? "Someone who wants to talk about money with you has given you a membership. Accept it, tell us about yourself, and book your conversation." : "We look forward to welcoming you to our community.");
  }
  // The gift membership (a mother or a daughter, honored rather than verified).
  if (prepaidInvitation) body = body.replace('id="hero-title">Apply for Membership', 'id="hero-title">Your gift membership')
    .replace('id="hero-tag">By Application Only', 'id="hero-tag">A gift for you');
  const headers = new Headers(asset.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.delete("last-modified");
  headers.set("cache-control", "no-store");
  return new Response(req.method === "HEAD" ? null : body, { status: 200, headers });
};
