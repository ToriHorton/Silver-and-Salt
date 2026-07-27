# Co-owners — sharing one app's db and tooling

An odla app can have more than one owner. The creator is the **primary owner**;
everyone else is a **co-owner** with the *same* full access. This is how a team
shares one database — dev and prod — with each person holding their own
revocable credentials. No secret is ever copied between people.

## The rule that makes this safe

Each owner mints their **own** `ODLA_API_KEY`. You never send someone a
`.dev.vars`, a `.odla/credentials.local.json`, or a key over chat. The registry
records who co-owns an app; the db honors any co-owner when they provision.

## Onboarding a co-owner

1. **The primary owner adds them** (they must already be a signed-up odla
   member — an admin invites them first if not):

   ```cmd
   npx @odla-ai/cli app owners add teammate@example.com
   npx @odla-ai/cli app owners list
   ```

   (`npx @odla-ai/cli app owners remove teammate@example.com` revokes it. The
   primary owner can't be removed. Studio's app **Settings** does the same.)

2. **The co-owner provisions as themselves.** They clone the repo (which carries
   `odla.config.mjs` but not the gitignored credentials) and run provision with
   their *own* account email — the device grant is approved by them, not the
   primary owner:

   ```cmd
   npx @odla-ai/cli provision --email teammate@example.com --write-dev-vars --push-secrets
   ```

   provision verifies the existing app (it does not re-create it), mints the
   co-owner's own db/o11y credentials for the shared tenant, writes their local
   `.dev.vars`, and transfers secrets to their Worker. They can now
   `npm run dev` and, at the production checkpoint, deploy.

## Production is one shared database

Every environment's tenant is the same across all owners (prod's tenant is the
bare app id; `dev` is `<appId>--dev`). So multiple co-owners deploying to
**production** all read and write the **same** prod database — each with their
own key. Treat first-prod provision/deploy as the usual human checkpoint
(`provision --dry-run` review, then `provision --yes --push-secrets`), and never
rotate another owner's credentials on their behalf.

## If provision says "you are not an owner"

provision checks tenant admin access up front and aborts **before** anything is
minted or written — no credential lands on disk, in the vault, or in a Worker.
It means the registry doesn't list you as an owner yet: ask an existing owner
to run `npx @odla-ai/cli app owners add <your-email>`, then re-run provision.

## If a co-owner loses their local key

Keys are shown once and stored hashed — there is no reveal. Re-mint instead:
re-run `provision` (or Studio's **mint API key**). Both work for any owner now,
not just the creator.
