# Phase 4 — AI (optional)

Goal: the worker calls an LLM via `initFromPlatform` — provider/model
from the registry, the key from the tenant vault. The key never enters
this conversation, wrangler config, or git.

Human obligation: obtain a provider API key and run ONE command in their
own terminal so you never see the value.

## Steps

1. Add `"ai"` to `services` and configure in `odla.config.mjs`:
   `ai: { provider: "<anthropic|openai|google>", keyEnv: "<PROVIDER>_API_KEY" }`
2. Ask the human to run, in their own terminal (NOT pasted to you, not
   via this session):

       export <PROVIDER>_API_KEY=...    # their key
       npx @odla-ai/cli provision

   provision stores the key in the tenant vault and sets provider/model
   in the registry. Their shell forgets it when closed; wrangler and git
   never see it. If they use `! npx @odla-ai/cli provision` in-session, the
   export must still happen in a terminal you don't read.
3. `npm i @odla-ai/ai`. In the worker, use `initFromPlatform` — it reads
   provider/model from public-config (cached ~60s) and resolves the key
   from the vault at call time using only the app's db key. Provider and
   model are switchable in Studio with no redeploy. Read the installed
   `node_modules/@odla-ai/ai/README.md` and exported TypeScript
   declarations/JSDoc for the version-matched API; the rendered reference at
   `https://odla.ai/docs/packages/ai` covers the public platform composition.
4. Add one `/api/*` route that round-trips the model; deploy dev.

## Verification checklist

- [ ] `npx @odla-ai/cli smoke --env dev` passes
- [ ] The AI route returns a model response on the deployed dev worker
- [ ] `wrangler.jsonc` `vars` contain NO provider key; `git grep` for the
      key's prefix finds nothing
- [ ] PM records the non-secret provider/model/route decision and deployed
      verification evidence

Rollback: remove the route; the vault key can be rotated/removed in
Studio.

Done when: a dev route returns a model response and the human approves
Phase 5 (their next obligations: domain into Cloudflare, DNS clicks,
prod Clerk instance if using login).
