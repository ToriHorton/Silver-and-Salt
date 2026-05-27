# Working Across Two Computers

This repo is edited from more than one computer. GitHub's `main` is the shared
source of truth; each computer is a copy. The whole point of the routine below
is to keep those copies in sync so work is never lost or forked.

Pushing to `main` also deploys the live site (silverandsaltcapital.com) within a
minute or two, so "push" and "publish" mean the same thing here.

## The routine (two habits)

**1. When you sit down to work, pull first:**

```
git pull
```

This grabs whatever the other computer pushed, so you build on the newest work.

**2. When you finish, save and send it back:**

```
git add -A
git commit -m "short description of what changed"
git push
```

Do these two things every session and your computers stay in sync.

## Always finish clean

After pushing, run:

```
git status
```

You want to see `nothing to commit, working tree clean` and `up to date with
'origin/main'`. Leftover uncommitted changes are the usual source of confusion,
so end every session clean.

## If the branches diverge

If you forgot to pull and both computers made commits, `git push` will be
rejected. Don't worry, nothing is lost. Just run:

```
git pull
git push
```

`git pull` merges the two sides for you. Conflicts are rare since you are the
only author; if one happens, ask Claude to help resolve it.

## Quick reference

| When | Command | What it does |
|---|---|---|
| Start of session | `git pull` | Get the latest from GitHub |
| Save your work | `git add -A` then `git commit -m "..."` | Record a checkpoint |
| Send it up (and publish) | `git push` | Update GitHub and deploy the live site |
| Check you're clean | `git status` | Confirm nothing is left uncommitted |

## Private pages

Pages kept "private" on this site are committed normally but marked unlisted with
`<meta name="robots" content="noindex, nofollow">` (for example brand-book.html).
They stay out of search results, but anyone with the exact URL can still open
them, so this is unlisting, not real access control.
