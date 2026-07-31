# Phase 5 — Production + DNS cutover

Goal: prod env provisioned and deployed, custom domain on the prod
worker, DNS cut over — with GitHub Pages kept live as the rollback for
at least 72 hours.

Human obligations: add the domain to Cloudflare; click through the DNS
changes (you supply exact values); if using login, **activate production
on the existing Clerk app** (`npx clerk deploy`) — the same app's prod
instance, never a second Clerk app per env; final go/no-go at each step.

## Steps

1. Update `odla.config.mjs`: add `"prod"` to `envs`; add
   `auth.clerk.prod` (`pk_live_…` from the app's **activated production
   instance** — one Clerk app, two instances, see below) if using login;
   add `links: { prod: "https://<domain>" }` (the CNAME domain captured in
   Phase 0). If using AI, the human re-runs the Phase 4 export + provision
   so the PROD tenant's vault gets the key.
2. `npx @odla-ai/cli provision --dry-run`, show the human, then
   `npx @odla-ai/cli provision --yes --push-secrets` — provisions the prod
   tenant (`<appId>`) and transfers its configured db/o11y secrets through
   Wrangler stdin. `--yes` is the explicit production consent; use standalone
   `secrets push --env prod --yes` only to retry the transfer (see
   references/secrets-map.md).
3. Build, then run the passive pre-cutover security gate:
   first require `npm view @odla-ai/security@0.3.1 version` to succeed. An
   exact-version `E404` means the release is unavailable and blocks cutover;
   it is not a clean scan and does not prove the package name is absent. Run
   `npm i -D --save-exact @odla-ai/security@0.3.1` followed by
   `npx odla-security scan . --profile odla --out .odla/security/pre-cutover --fail-on high --fail-on-candidates critical`.
   Review `REPORT.md`; a candidate is a lead, not confirmation, and a baseline
   requires a concrete reason, owner, and expiry.
   If the human explicitly approves redacted tracked-source disclosure, follow
   with `npx @odla-ai/cli security run . --env prod --ack-redacted-source`.
   The platform owns provider credentials and attributes the bounded,
   independent-model run to this app; never request provider keys locally.
   For a repeatable commit-pinned review, the human can first approve
   `security github connect --env prod`, then the agent runs `security plan`,
   lists `security sources`, and runs `security run --source <id> --ref <ref>
   --env prod --plan-digest <digest-from-security-plan>
   --ack-redacted-source`. Never request a PAT; GitHub read approval is not
   snippet-disclosure consent.
4. `npx wrangler deploy` (first prod deploy). Verify
   `/api/health` and the parity paths on the prod workers.dev URL.
5. `npx @odla-ai/cli smoke --env prod`.
6. Human: add the domain to Cloudflare, then attach it to the prod
   worker (Workers & Pages → the worker → Domains & Routes). Supply
   them the exact hostname values to enter.
7. Cut DNS. GitHub Pages STAYS PUBLISHED — if anything looks wrong,
   the rollback is pointing DNS back at Pages.
8. Verify from the public domain: parity paths, the gated route (signed
   in and out), `/api/*` routes, the AI route if present.
9. Update MIGRATION.md: cutover timestamp, verification results, and a
   dated reminder ≥ 72 hours out to decommission Pages.
10. After ≥ 72 hours of clean parallel-run and explicit human
    confirmation: disable GitHub Pages in the repo settings. KEEP the
    repo — it is still the source of the site.

## Clerk in prod — one app, two instances

A Clerk **application** has a Development instance (used in dev) and a
Production instance. Production (`pk_live_…`) is **domain-coupled**:
`npx clerk deploy` walks the human through the production domain + DNS —
the same domain you're cutting over here — so activating it fits naturally
at Phase 5. **Do NOT create a second Clerk app per environment** — activate
production on the *existing* app. Then:

- Re-apply the instance config to the prod instance:
  `npx clerk config patch --instance prod --file clerk-config.json`, and
  re-add allowlist identifiers with `--app <id>` (see phase-3-auth.md).
- If mirroring users, add the `$users` webhook for the prod instance/tenant
  (`https://db.odla.ai/webhooks/clerk/<appId>` + `whsec_` in the prod
  tenant vault) — see phase-3b-user-sync.md.

## Verification checklist

- [ ] `npx @odla-ai/cli smoke --env prod` passes
- [ ] Passive `odla-security` pre-cutover report reviewed; critical lead gate passes
- [ ] Public domain serves from the worker (check the `x-odla-worker`
      header) on every parity path
- [ ] Auth and AI routes verified from the public domain
- [ ] Pages still enabled until the 72-hour confirmation

Rollback: point DNS back at GitHub Pages (minutes). Nothing on the
odla/Cloudflare side needs to be torn down to roll back.

Done when: the 72-hour confirmation is done and MIGRATION.md is closed
out. Congratulate the human — and mention Studio (https://odla.ai/studio) as
where they watch their app from now on.
