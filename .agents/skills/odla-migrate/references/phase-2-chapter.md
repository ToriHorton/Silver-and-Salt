# Phase 2 (chapter): membership sites start from `defineChapter()`

**Use this instead of hand-authoring `src/odla/schema.mjs` when the site is a
membership site** — applications/join, paid membership, booked intro calls, a
member area, an admin console, a people CRM. `@odla-ai/chapter` generates all of
that. A real conversion deleted ~2,500 lines: a 2,094-line worker became 6, and
four hand-maintained files (schema, rules, group seed, provisioner) became one
`defineChapter()` call.

If the app is NOT a membership site, stay on `phase-2-db.md`. If it is a
membership site with a few extra entities, use chapter for what it models and
hand-author only the namespaces it does not.

## The sequence (do not reorder)

1. **Write the config and assert parity BEFORE deleting anything.**
   ```js
   export const chapter = defineChapter({
     id: "example-chapter", name: "Example", mode: "chapter",
     prices: { standardCents: 90000 },
     emails: { notificationEmail: "owner@example.com" },
   });
   ```
   Then diff `chapter.schema` against the site's existing schema **in a test** and
   require equality.
2. **Prove the comparator is independent.** Anchor the reviewed legacy side to
   an exact checked-in source path + commit + digest, or copy it to a literal
   `test/fixtures/legacy-schema.mjs`. It must not import Chapter, the active
   schema/descriptor alias, or another generated candidate, and the migration
   change must not silently update both sides. Deliberately remove or alter one
   known field/rule and prove the test fails before trusting a green result.
   Keep this guard after deletion so an upstream default change fails a test
   instead of a live `provision`.
3. **Swap provisioning** — `createChapterIntegration(chapter)` in
   `odla.config.mjs` `integrations: [...]`. Inert until the next provision run. It
   supplies schema + rules + seeds, so the `db` block goes away entirely.
4. **Then the worker**, keeping every bespoke route as a host route:
   `chapterWorker({ chapter, routes })` runs host routes BEFORE the built-ins and
   hands each the same context (`ctx.verifyUser`, `ctx.makeDb`, `ctx.roleFor`,
   `ctx.isAdmin`), so you never verify a JWT twice. Do NOT hand routes over to
   chapter in the same change as the framework swap.
5. **Adopt the host-independent console shell without replacing product
   behavior.** Import the scoped theme, `@odla-ai/ui/index.css`, and
   `@odla-ai/crm/ui.css`, then render `ChapterAdmin` at the existing `/admin/`
   mount. A greenfield site may accept the default workspaces after reviewing
   them against its product requirements. An operating site must preserve each
   validated workspace through the `workspaces` transform until the
   feature-level UI gate below proves the packaged composition equivalent.
   Chapter's default navigation uses fragments such as
   `/admin/#people/person/record-id/profile`; keep legacy query/path links only
   as inbound compatibility URLs.
6. **Override rather than inherit wherever local behavior was a decision.**
7. `npx @odla-ai/cli doctor` → `provision --dry-run` (show the human) → provision.

### Existing admin workspace gate

Labels and route ids are inventory keys, not parity evidence. A legacy
workspace named "People" and Chapter's default `people` workspace can use the
same CRM rows while exposing different summaries, search and filtering,
selection behavior, role signals, mutations, and error states.

For every existing workspace, inventory and test:

- summaries and operational counts;
- search, filters, sort, pagination, saved views, and responsive list/detail
  geometry;
- role, permission, lifecycle, billing, and identity signals;
- record tabs, deep links, and every mutation or provider side effect;
- loading, empty, error, unauthorized, keyboard, and narrow-screen states.

Classify each item as packaged-equivalent, composed through a documented
Chapter/CRM seam, an explicit PM-approved product change, or blocked. A matching
top-level label, a populated table, or a green schema/API test proves none of
those classifications.

The safe first cutover is to preserve the existing workspace first and let
Chapter own the surrounding auth, routing, chrome, and other reviewed defaults:

```tsx
const workspaces = (defaults) => {
  if (!defaults.some((workspace) => workspace.id === "people")) {
    throw new Error("expected ChapterAdmin people workspace");
  }
  return defaults.map((workspace) =>
    workspace.id === "people"
      ? { ...workspace, render: (ctx) => <ExistingPeople context={ctx} /> }
      : workspace
  );
};

<ChapterAdmin chapter={chapter} workspaces={workspaces} />;
```

Match the exact id and fail closed if Chapter changes its catalog. Spread the
default workspace so its reviewed routing metadata survives. Keep an
integration test that asserts the host component renders and that representative
summary, exploration, role, and operation affordances are present.

Only then migrate pieces into `collectionSection`/`peopleSection` using
`renderSummary`, `renderMaster`, `renderDetailHeader`, `renderEmptyDetail`,
`hrefForRecord`, `extendRecordTabs`, and an application-authoritative
`lifecycleAdapter`. Delete the old workspace only after the complete behavioral
matrix and deployed viewport journey pass. For a greenfield site, build the same
matrix from requirements; there is no legacy component to preserve.

## Behavior deltas to audit

These bite silently; no smoke test catches them.

- **Per-field caps.** `application.defaultMaxLen` is 2000. A join form accepting a
  5000-char message starts rejecting input. Pass `maxLen` explicitly.
- **`services` default** is `["db","calendar","o11y"]`; `smoke` compares config
  against the platform, so set it explicitly if you don't run the o11y collector.
- **Which email fires from which route.** `adminNotification` fires on
  `POST /api/applications` by default; `prepEmail` from `/api/schedule/book`;
  `paymentConfirmation` from the Stripe webhook. Set
  `sends: { adminNotification: "payment" | "submit" | "never" }` if the site's
  policy differs — and re-check this on every chapter upgrade, since wiring a
  send changes outbound mail with no local diff.
- **Account creation model.** `account` defaults to **`"none"`** (provisions
  nothing) — the other models have an outbound side effect, so a site opts in.
  `"create"` makes the account server-side; `"invite"` **emails a Clerk
  invitation**. Swapping in chapter's route while expecting server-side create
  loses it silently unless you set `account: "create"` — the applicant finds out
  when they cannot sign in.
- **CRM authority.** `applications` remains authoritative for member lifecycle;
  `crm_record` mirrors identity, stage, billing, and Clerk linkage. Leader →
  follower delivery intentionally copies allowlisted record fields only, not
  another site's pipeline/account/billing authority.
- **Leader/follower identity and credentials.** Each website has its own
  `appId`, ODLA tenant/key, Clerk application/issuer, roles, and users. A leader
  browser JWT authenticates only to the leader admin route. The leader Worker
  sends a per-edge vault share secret; the follower validates it and writes
  through its own `ODLA_API_KEY`. Never share a Clerk application between
  websites, accept another site's JWT, or move either ODLA key across the edge.
- **Route contracts.** Chapter owns `/api/config` and the group-scoped
  `/api/join-config`, but a matching path or matching monetary values do not
  make it a drop-in replacement. Compare method, auth, request body, response
  status, keys/types/nesting, units, null/omission semantics, and relevant
  headers. Chapter 0.25's join-config returns raw cents, policy copy, and
  readiness; it does not supply a legacy route's prebuilt Stripe line items or
  publishable key. Adopt `JoinIsland` end to end or keep a tested adapter.
  `PaymentStep` gets `clientSecret`, `publishableKey`, and `lineItems` from
  `POST /api/payments/subscription` after the application is submitted and the
  refund policy is acknowledged.
- **Follower record types.** A follower rejects a pushed business/deal if its own
  CRM does not declare that type and fields. Add the type to the follower config
  and expose it through the standard console before enabling the target in the
  leader.
- **People workspace width.** The standard CRM list uses the full workspace
  width until a record is selected, then becomes master/detail. Keep
  `collectionSection({ collapseClosedDetail: true })` unless the empty detail
  pane contains intentional useful content. `renderMaster` and `renderSummary`
  customize content, not pane geometry. At 1280/1440 prove a wide table is not
  squeezed into a narrow rail beside an empty pane.

## Install notes

- **A worker-only adoption does not need `@odla-ai/auth-clerk`.** The worker
  verifies Clerk JWTs with `jose` via `ctx.verifyUser`. Install auth-clerk only
  for `@odla-ai/chapter/ui/admin` (the Clerk-gated console) or the themed sign-in
  components; `@odla-ai/chapter/ui/member` needs only Preact.
- **`--legacy-peer-deps` is a diagnostic, not a setting.** It suppresses exactly
  the peer error that tells you a pair is unsupported. If an install errors, read
  it. A site that left the flag on ran an unsupported ui/crm pair for a day with
  no signal.

## Verify the surface from the types

Docs lag at this release cadence. **Read `dist/*.d.ts` and grep the built bundle
for route strings; treat prose as intent.** A deployed response proves only the
immutable deployment version you actually probed, not the route owner or
contract of the branch in front of you. Record source path + commit and deployed
Worker version separately. When verifying live routes, note that Clerk session
tokens expire in ~60s — a script that mints a JWT then runs a batch of curls must
re-mint per batch (`clerk api /sessions`, then `/sessions/<id>/tokens`).
