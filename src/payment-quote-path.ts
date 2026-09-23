// The one place the quote route's path is written down. Both the mount's
// request normalizer (src/worker-chapter.ts) and the synthetic canary
// (src/checkout-probe.ts) match on it, and they must never drift apart.
export const PAYMENT_QUOTE_PATH = "/api/payments/quote";
