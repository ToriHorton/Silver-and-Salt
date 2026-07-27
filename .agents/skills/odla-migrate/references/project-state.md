# Project state — use PM, not a migration diary

The migration's durable coordination state lives in odla PM. Do not create or
maintain a parallel migration/status diary in the source tree. Source files
describe the product; PM describes goals, active work,
decisions, defects, and verification evidence across agents and sessions.

## Bootstrap before the odla app exists

PM items require a registered, co-owned app. Phase 0 and Phase 1 deliberately
precede platform registration, so do not pretend PM is available yet and do not
borrow an unrelated app as a container.

1. Choose the intended stable `appId` during Phase 0.
2. Keep each early phase in a focused branch/commit. Put the phase, immutable
   source commit, evidence locations, and next gate in the checkpoint handoff
   and commit message. Do not create a diary file.
3. A fresh agent before registration reruns the Phase 0 inventory checks, reads
   the focused commits, and treats old branches, git history, unrelated
   deployments, and prior experiments only as leads to verify.
4. Immediately after the first successful Phase 2 `provision` registers the
   app, initialize PM and backfill the approved Phase 0/1 outcomes and evidence.
   From then on, PM is authoritative.

This bootstrap gap ends at registration. Do not keep using commit messages as
project management after PM becomes available.

## Initialize the migration in PM

Read the complete PM command contract at
`../../odla/references/pm.md`. Never put a credential or secret in an item or
comment.

Create:

- one conformance goal per acceptance outcome, with a concrete proof path or
  command;
- one task per migration track or phase, linked to its goal and placed in the
  correct board column;
- a decision for each product, data-authority, identity, route-contract, or
  rollback choice;
- a bug for every observed defect, including defects outside the current task.

Backfill Phase 0/1 as completed tasks with comments naming the reviewed source
commit, immutable deployment version where applicable, evidence artifact, and
human checkpoint. Do not copy secrets or large logs into PM.

## Start every later session by reading

Resolve `appId` from `odla.config.mjs`; do not guess it from a repository name,
deployment, old branch, or conversation.

```cmd
npx @odla-ai/cli pm task list --app <appId> --column doing
npx @odla-ai/cli pm bug list --app <appId> --status open
npx @odla-ai/cli pm decision list --app <appId> --limit 20
npx @odla-ai/cli pm goal list --app <appId> --status open
```

Read the linked goal and the active task's comments before editing. Confirm
their source commit/deployment evidence still identifies the implementation
being tested. If PM and the working tree disagree, stop, investigate, and
record the resolution as a decision or comment; do not silently pick whichever
is more convenient.

## Update at every gate

- Move the phase/track task when work starts.
- Comment with the exact verification command, result, source commit, candidate
  deployment version, and rollback checkpoint.
- Record an intentional contract or product delta as a decision.
- File a defect as a bug rather than hiding it in a task comment.
- Mark a goal met only after its stated proof passes.
- Mark a task done only after its goal/evidence and human checkpoint are
  complete.

For parallel migrations, keep separate tasks per track (runtime, data, auth,
payments, scheduling, email, public UI, admin UI, observability) and link each
to its own conformance goal. This lets multiple agents claim independent work
without sharing a branch or overwriting one status document.
