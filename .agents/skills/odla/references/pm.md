# PM — the project's memory, for agents

odla ships a project manager built for the agents doing the work:
**conformance goals**, a kanban **board**, a **decision** log, and **bugs**. It is
not a status report for a human to read later — it is your working memory across
sessions, and the place another agent (or the human) picks up what you learned.

Use it. A decision you don't record is one the next agent re-litigates; a bug you
only mention in chat is a bug nobody fixes.

## What it is, mechanically

- PM data lives on the **platform**, in odla's own shared store — *not* in the
  app's database. There is no PM schema or integration to install, but the
  project app must already be registered so ownership can scope access.
- Every item is tagged with an **appId**, and access rides **app co-ownership**:
  you see and write PM items for exactly the apps you co-own
  (`references/co-owners.md`). Co-own three apps and one `pm bug list` spans all
  three.
- Auth is the same developer device grant the rest of the CLI uses. The first
  `pm` command in a fresh checkout may print an approval code — relay it to the
  human verbatim, same as `provision`.
- The human's view of the same data is **https://odla.ai/studio/pm** (and each
  app's **Project** tab in Studio): the board is drag-and-drop there, and every
  section filters by project.

For a brand-new app, use a focused branch/commit and a clear checkpoint handoff
only until the first successful `provision` registers it. Then initialize PM
immediately and backfill the approved early decisions and evidence. Never use
an unrelated app as a temporary PM bucket, and never keep a parallel project
diary after PM is available.

## The four things, and when each one is right

| You have | File it as | Because |
| --- | --- | --- |
| an outcome that must be true, plus the test that proves it | **goal** | it carries `--proof`; `pm goal done` means the proof passed, not "I think it works" |
| a specific unit of work | **task** | it has a board column, so the human can see what is moving |
| a choice that closes off alternatives | **decision** | the log is full-text searchable, so the *next* agent finds the why |
| something that is broken | **bug** | it has a severity and survives the session that noticed it |

Do not file a task per keystroke. One task per thing a human would recognise as a
piece of work; one decision per choice you would otherwise bury in a commit
message; one bug per defect.

## The commands

Entity is `goal | task | decision | bug`; every command takes `--json` for
machine-readable output.

```cmd
npx @odla-ai/cli pm bug add --app <appId> --title "Checkout 500s on retry" --severity high --desc "…"
```

```cmd
npx @odla-ai/cli pm bug list --app <appId> --status open
```

```cmd
npx @odla-ai/cli pm task set <id> --column doing
```

```cmd
npx @odla-ai/cli pm decision list --q "stripe"
```

- `add` needs `--app <appId>` and `--title`; it takes the entity's own fields
  (`--proof`, `--target` for goals; `--column`, `--goal`, `--assignee`, `--due`
  for tasks; `--body` for decisions; `--severity`, `--desc` for bugs).
- `list` filters with `--status`, `--severity`, `--column`, `--assignee`,
  `--goal`, full-text `--q`, and pages with `--limit` / `--offset`. **With no
  `--app` it spans every project you co-own** — that is the cross-project view,
  and it is usually the one you want when you start a session.
- `get <id>` prints one item; `set <id> --<field> <value>` patches it
  (`--no-<field>` clears an optional field); `done <id>` is the shortcut for the
  terminal state (goal → met, task → done, decision → accepted, bug → fixed).
- `comment <id> --body "…"` and `comments <id>` are the item's discussion thread.
  Status and column changes post there automatically, so the thread is the audit
  trail — the human sees what you did without asking.
- `rm <id>` deletes. Prefer `done` or a status change; deletion loses the thread.

## Working with it

**At the start of a session**, read before you write:

```cmd
npx @odla-ai/cli pm task list --app <appId> --column doing
```

then `pm bug list --app <appId> --status open` and
`pm decision list --app <appId> --limit 10`, plus
`pm goal list --app <appId> --status open`. Read the active task, linked goal,
and their comments. That is the state of the project—including anything a
*different* agent left behind.

When coordinating several efforts, begin without `--app` to see doing tasks and
open bugs across every co-owned project, then scope each write to the exact
`appId` from that project's `odla.config.mjs`. Parallel agents should own
different board tasks and different branches/worktrees; they coordinate through
goal links and comments rather than sharing a working tree or status document.

**While you build:**

- Move the card when the work moves — `pm task set <id> --column doing` when you
  start, `pm task done <id>` when it is really done (tests green, not "written").
- Record a decision the moment you make it, with what it rules out:
  `pm decision add --app <appId> --title "Bun over tsx for the worker build"
  --body "…"`. This is the single highest-value thing you can do here.
- File a bug the moment you notice it, even mid-task, even if it is not yours.
  `--severity critical|high|medium|low`. Then keep going — the bug is captured,
  so it does not have to derail what you are doing.
- A goal is how you say what "done" means before you start:
  `pm goal add --app <appId> --title "Checkout survives a retry storm" --proof
  "test/checkout-retry.test.ts"`. Mark it met only when that proof passes.

**Never** put a secret, a token, or a credential in a title, body, description,
or comment. PM items are shared with every co-owner of the app.

## Checkpoints

PM writes are not destructive and need no approval — file freely. Deleting an
item (`pm … rm`) and closing something you did not open are the two calls to
put to the human first.
