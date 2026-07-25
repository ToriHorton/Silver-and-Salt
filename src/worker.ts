// Worker for the Silver & Salt Capital site.
//
// Everything this file used to do by hand (Clerk JWT verification, the odla-db
// admin client, the join/pay/book member surface, the /api/admin/* operations
// API, the Stripe webhook, the CRM mount, the email pipeline, the static-asset
// fallback) is now @odla-ai/chapter, configured by src/chapter.config.mjs.
//
// The two workarounds this file carried against chapter 0.23.0 are gone,
// fixed upstream in 0.24.0:
//   - JoinIsland collapsed repeated form fields, so the seven "Interests"
//     checkboxes posted one string. It now collects them with getAll.
//   - The Stripe webhook and the booking route wrote applications.status
//     without mirroring it into the CRM, so the admin dashboard's pipeline
//     (which reads crm_record.stage) showed paid and booked members as still
//     submitted. Both routes now mirror.
//
// Two pre-conversion paths are gone rather than aliased:
//   /api/auth/config                 -> /api/config
//   /api/groups/:groupId/join-config -> /api/join-config
// Both changed response SHAPE, not just path, so a path-only alias would answer
// 200 with a body the caller cannot read. Every caller moved in the same change.

import { chapterWorker } from "@odla-ai/chapter/worker";
import { chapter } from "./chapter.config.mjs";

export default chapterWorker({ chapter });
