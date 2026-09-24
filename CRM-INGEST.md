# CRM call ingest

Call and meeting data for members and prospective members, stored in the odla
CRM instead of a static dashboard file.

## What this replaces

The morning pull used to write `granola-inbox.js`, a static file published as
an unlinked page. That design had three failure modes, all of which are now
gone by construction:

1. **It re-proposed the same work forever.** A single scheduling thread
   generated six separate tasks, and `task-decisions.json` had to be maintained
   by hand to suppress them. Now `addActivity` takes a deterministic
   `mutationId` and returns `{ id, duplicate }`, so a replay is a no-op.
2. **It published through git.** A commit on the wrong branch silently no-opped
   for four weeks in 2026, and after the Cloudflare cutover the page stopped
   being served at all (the build only ships files reachable from the entry
   pages, and `deploy.yml` fails if the dashboard appears in `dist/`). There is
   no git step here at all.
3. **Call history was organised by date, not by person.** Now opening a member
   shows every call with them, in order.

## The model

Nothing new was added to the CRM schema. This uses what `@odla-ai/crm` already
has:

| Need | Existing primitive |
| --- | --- |
| A call or meeting on someone's timeline | `addActivity({ kind: "call" \| "meeting" })` |
| A follow-up | `addActivity({ kind: "task" })` with `status` / `dueAt` / `waitingOn` |
| Tori's open list, soonest first | `listTasks({ status, dueBefore })` |
| Triage that sticks | `updateTask({ status: "done" })`, stored in the row |
| Prospect provenance | `upsertRecordOrigin` + the `auto-created` tag |
| Replay safety | `mutationId` on every write |

`applications.status` stays authoritative exactly as `src/crm-sync.mjs`
describes. The ingest never calls `setStage` on a person who already exists, so
it can never move someone's application status. The only stage it sets is the
initial `candidate` on a person it just created.

## Files

- `src/crm-ingest.mjs` — the mapping. Pure data plus CRM calls, no HTTP.
- `src/worker.ts` — `POST /api/crm-ingest`, guarded by `CRM_INGEST_SECRET`.
- `tests/crm-ingest.test.mjs` — including a direct assertion that replaying a
  meeting writes nothing the second time.

## The endpoint

`POST /api/crm-ingest`, `Authorization: Bearer <CRM_INGEST_SECRET>`.

Deliberately narrow. It accepts only meeting, call and task writes. It cannot
read the CRM, cannot send email, and cannot write `stage_change` or `system`
activities. A leaked ingest secret therefore exposes no member data and cannot
mail the membership, which a full admin service token would.

It fails closed: if `CRM_INGEST_SECRET` is unset, every request is refused.

Body:

```json
{
  "meetings": [
    {
      "sourceId": "granola",
      "meetingId": "<stable upstream id>",
      "title": "Intro call with …",
      "summary": "…",
      "url": "https://…",
      "kind": "call",
      "occurredAt": 1800000000000,
      "attendees": [{ "email": "…", "name": "…" }],
      "actionItems": [{ "text": "…", "owner": "", "due": "2026-10-01" }]
    }
  ]
}
```

Returns a per-meeting report. `200` when everything landed, `207` when some
meetings failed and the rest still did: one malformed note never sinks the
batch.

Behaviour worth knowing:

- Addresses on `@silverandsaltcapital.com` are never turned into CRM people.
- The call is written to **every** external attendee. Follow-up tasks go to the
  **first** one only, so a three-person call does not triple every action item.
- An action item with no resolvable person comes back as `unattached` rather
  than being parked on an arbitrary record.
- `due` accepts `YYYY-MM-DD` and is anchored at noon UTC, so rendering it back
  in Mountain Time cannot roll it to the previous day.
- An item with an `owner` is stored with `waitingOn`, so it lands on the
  waiting board rather than Tori's open list.

## Consent posture

A person auto-created from a call is written with consent `unsubscribed`.

They were on a call; they did not opt into marketing. The CRM's consent gate
skips unsubscribed contacts for `marketing`-class templates but still allows
the `transactional` `personal` template. So Tori can follow up personally, and
a candidate can never be swept into an announcement blast they never asked for.
If someone later joins, the normal application flow sets their real consent.

## Wiring it up

Not yet deployed. In order:

1. Generate a secret and set it on dev:
   `npx wrangler secret put CRM_INGEST_SECRET --env dev`
2. Deploy the branch to dev and exercise it with a sample payload.
3. Confirm the call and its tasks appear on the person in the admin CRM panel.
4. Set the same secret on production and merge with `--ff-only` once the
   checkout gates pass.
5. Repoint the scheduled morning task: it pulls Granola and Gmail as it does
   today, then POSTs here instead of writing a file and pushing to git. It
   should report what it wrote and stop there. No git, no publish, no verify.

## Backlog import

The roughly 95 untriaged items from the old inbox live in the Library repo
(`~/Projects/Silver-and-Salt-Library/dashboard/`), which is not mounted in the
session that wrote this. Importing the dated and still-open ones is a separate
one-shot script against the same endpoint.
