// Synthetic checkout canary.
//
// On 2026-09-22 a packaged Chapter upgrade (0.55.0) made POST
// /api/payments/quote answer 400 to the request its OWN payment step sends,
// and membership checkout was down for every paid tier for about 41 hours.
// Nothing caught it. A failed quote writes no row, sends no email, and leaves
// no admin notification, so there was no signal anywhere: it was found only
// when the owner tried to buy a membership herself. `npm test` stayed green
// throughout, because both halves of the broken contract live inside the
// package and no test crossed that boundary.
//
// This probe makes the path answer for itself, on every cron tick and once
// more after every deploy.
//
// It asks the quote route for an application id that cannot exist, using the
// bodyless POST the payment step sends. Chapter parses the request body BEFORE
// it looks the application up, so the two answers separate cleanly:
//
//   404  the body was accepted and the lookup ran. The contract holds.
//   400  the body guard refused the payment step's own request shape.
//        That is the 2026-09-22 outage, and checkout is down.
//
// Nothing is created, charged, or mutated: the id belongs to no application,
// so the probe is safe to run against production as often as we like.

import { PAYMENT_QUOTE_PATH } from "./payment-quote-path";

/** A syntactically valid uuid that is never issued to an application. The
 *  route's own length guard (160 chars) accepts it, so the request reaches the
 *  body parse and then the lookup, which is exactly what we are testing. */
export const PROBE_APPLICATION_ID = "00000000-0000-4000-8000-000000000000";

export interface CheckoutProbeResult {
  /** True when the quote route still accepts the payment step's request. */
  ok: boolean;
  /** The status the route answered, or 0 when the request never completed. */
  status: number;
  /** One low-cardinality reason, safe for logs and alerts. */
  detail: string;
}

/**
 * Run the canary through `fetcher`, which should be the Worker's own composed
 * handler so the probe exercises the real mount rather than a reconstruction.
 */
export async function probeCheckoutQuote(
  fetcher: (req: Request) => Promise<Response>,
  origin: string,
): Promise<CheckoutProbeResult> {
  const url = `${origin.replace(/\/$/, "")}${PAYMENT_QUOTE_PATH}?application=${PROBE_APPLICATION_ID}`;

  let res: Response;
  try {
    // The payment step's opening call: POST, no body, no content type.
    res = await fetcher(new Request(url, { method: "POST" }));
  } catch (err) {
    return { ok: false, status: 0, detail: `probe_request_failed: ${(err as Error).message}` };
  }

  if (res.status === 404) {
    return { ok: true, status: 404, detail: "quote route accepted the payment step's request" };
  }
  if (res.status === 400) {
    let code = "";
    try {
      const body = (await res.json()) as { error?: unknown };
      code = typeof body.error === "string" ? body.error : "";
    } catch {
      // A 400 is already the failure; an unreadable body does not change it.
    }
    return {
      ok: false,
      status: 400,
      detail: `quote route refused the payment step's request: ${code || "400"}`,
    };
  }
  return {
    ok: false,
    status: res.status,
    detail: `quote route answered ${res.status}; an unknown application must answer 404`,
  };
}
