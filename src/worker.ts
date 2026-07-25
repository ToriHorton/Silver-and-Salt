// Worker for the Silver & Salt Capital site.
//
// Everything this file used to do by hand (Clerk JWT verification, the odla-db
// admin client, the join/pay/book member surface, the /api/admin/* operations
// API, the Stripe webhook, the CRM mount, the email pipeline, the static-asset
// fallback) is now @odla-ai/chapter, configured by src/chapter.config.mjs.
//
// Two pre-conversion paths are gone rather than aliased:
//   /api/auth/config                        -> /api/config
//   /api/groups/:groupId/join-config        -> /api/join-config
// Both changed response SHAPE, not just path (the old join-config returned a
// computed `lineItems`; the old auth config returned `publishableKey`/`issuer`).
// A path-only alias would answer 200 with a body the caller cannot read, which
// fails deeper and reads as a bug. Every caller moved to the new paths in this
// same change, so a stale bundle gets a clean 404 instead.

import { chapterWorker } from "@odla-ai/chapter/worker";
import { chapter } from "./chapter.config.mjs";

export default chapterWorker({ chapter });
