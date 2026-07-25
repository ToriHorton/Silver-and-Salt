# @odla-ai/chapter 0.23.0: adoption feedback

> **All four findings are fixed in 0.24.0** (odla-ai branch
> `fix/chapter-adoption-findings`). This document is kept as the record of what
> was observed and why each fix is shaped the way it is. Items 1 and 2 had local
> workarounds in `src/worker.ts`; both are deleted.

Findings from converting Silver & Salt Capital (the site chapter was extracted
from) onto the published package. Everything below was observed on a live dev
tenant, not read out of the source. Excluded from the public build.

Context: the conversion removed 11,358 lines and added 2,018. The worker went
from 2,094 lines to a single `chapterWorker({ chapter })` plus the two
workarounds below. Schema parity was exact, first try.

---

## 1. `JoinIsland` drops all but the last value of a repeated form field

**Severity: high. Silent data loss on a public form.**

`JoinIsland`'s submit handler collects the form with:

```js
for (const [k, v] of new FormData(e.currentTarget).entries()) fields[k] = v;
```

Repeated names overwrite, so a checkbox group sharing one `name` posts a single
string. `getAll` appears nowhere in the shipped bundle. Our join form has seven
"Interests" checkboxes named `focus`; an applicant selecting three would have
had two silently discarded.

It is not caught downstream. Verified against the dev tenant:

| posted | stored in `applications.focus` |
|---|---|
| `["A","B","C"]` | `["A","B","C"]` (array) |
| `"[\"A\",\"B\"]"` | `"[\"A\",\"B\"]"` (string, not parsed) |
| `"A"` | `"A"` (string) |

So the server does the right thing with an array, and the client cannot produce
one. `application.maxArrayLen` and the json-typed `focus` attr both imply arrays
are the intended shape.

**Suggested fix:** collect with `getAll` and keep the array when a key repeats.

```js
const fields = {};
const fd = new FormData(e.currentTarget);
for (const key of new Set(fd.keys())) {
  const all = fd.getAll(key);
  fields[key] = all.length > 1 ? all : all[0];
}
```

There is no seam to work around this from the host: `renderSubmit` receives
only `{ submitting, disabled }`, and nothing transforms the payload. Our
workaround posts a hidden JSON-array input and parses it in a worker wrapper
(`src/app/join.jsx`, `src/worker.ts`).

---

## 2. The CRM stage is not mirrored on payment or booking

**Severity: high. Chapter's own dashboard shows the wrong pipeline.**

`syncApplicationToCrm` is called from two of the four places that write
`applications.status`:

| writer | syncs CRM |
|---|---|
| `POST /api/admin/applications/:id/approve` | yes |
| `PATCH /api/admin/applications/:id` | yes |
| `POST /api/webhooks/stripe` (`paid_pending_vetting`, `refunded`) | **no** |
| `POST /api/schedule/book` (`call_scheduled`) | **no** |

The two that skip it are the two that happen without an admin, so they are by
far the most common transitions.

This is self-inconsistent rather than merely undocumented, because
`handleAdminDashboard` builds its pipeline funnel and weekly deltas from
`crm_record.stage`. Observed live: a test application reached
`paid_pending_vetting` with both lifecycle emails sent, while its `crm_record`
stayed at stage `submitted` with `billingStatus` unset. The console's main
at-a-glance view would report every paying applicant as still unpaid.

The README's note that `projectApplicant` runs "on application submit, not on
booking or on webhook status change" reads as a deliberate choice, but the
dashboard depends on the mirror, so the two do not agree.

**Suggested fix:** call `syncApplicationToCrm` from the webhook and booking
paths too, or have the dashboard read `applications.status` (it already loads
1,000 applications in the same `Promise.all`).

Our workaround re-projects the affected application after those two requests
succeed, via `ctx.waitUntil` (`resyncCrmStage` in `src/worker.ts`).

---

## 3. The payment consent gate lost its affirmative statement

**Severity: high. It is the consent record for a $900 charge.**

This site's payment step used to render the policy and the agreement as
separate things:

```html
<div class="compliance-box">
  <p>{refundPolicyText}</p>
  <label class="compliance-check">
    <input type="checkbox" />
    <span>I have read and agree to the pricing and refund policy above.</span>
  </label>
</div>
```

`PaymentStep` renders:

```jsx
<label className="compliance-box">
  <input type="checkbox" onChange={e => { if (e.currentTarget.checked) void begin(); }} />
  <span>{refundPolicyText}</span>
</label>
```

Two consequences. The checkbox now sits inline at the head of about a thousand
characters of legal copy, so it reads as a bullet rather than a control. And
the affirmative sentence is gone entirely: the member checks a box whose label
IS the policy, rather than one that says they agree to it. What gets recorded
in `refundPolicyAckAt` is the same either way, but what the member was shown at
the moment of consent is materially weaker.

There is no way to restore it from the host. `ChapterCopy["join"]["payment"]`
has `setupFailed`, `preparing`, `pending`, `processing`, `payAndContinue`, and
`incomplete`, but no consent string. `payment.children` renders after the price
lines and outside the `<label>`, so a sentence placed there is neither adjacent
to the control nor associated with it. Appending the sentence to
`policy.refundPolicyText` would leak it into the `paymentConfirmation` email,
which interpolates `{{refundPolicyText}}`.

**Suggested fix:** add `copy.join.payment.consent` (default something like
"I have read and agree to the pricing and refund policy above."), render the
policy in its own block, and put the checkbox with that sentence in a nested
label beneath it. A site that wants today's behavior can set the key to empty.

---

## 4. `clerkAppearanceFromTokens()` reads the document root, not the admin scope

**Severity: medium. Off-brand sign-in on any dark-mode machine.**

`ChapterAdmin` renders `ClerkGate` with `appearance: clerkAppearanceFromTokens()`,
and that function defaults to `getComputedStyle(document.documentElement)`.
But `AdminTheme` deliberately scopes the brand to `[data-chapter-admin]`:

```jsx
<ThemeScope data-chapter-admin theme={brand?.theme} accent={brand?.accent} ...>
  <BrandStyle brand={brand} selector="[data-chapter-admin]" />
```

So the Clerk widget is themed from whatever the host's `:root` happens to hold,
which is exactly what the scoping is meant to prevent. On a host page with no
`--ui-*` at root, `@odla-ai/ui`'s `prefers-color-scheme: dark` block wins and
the sign-in card renders dark charcoal with a periwinkle button, while the
console two pixels below is correctly light and lime. Measured on the deployed
page: `--ui-accent` was `#7ba1d4` at root and `#7CB83F` inside the scope.

**Suggested fix:** pass the theme scope element, e.g.
`clerkAppearanceFromTokens(scopeRef.current)`.

Our workaround pins the twelve custom properties that function reads onto
`:root` in `admin/index.html`, which is duplication the scoping was supposed to
remove.

---

## 5. The signed-out gate assumes it owns the page

**Severity: low, but it fights `chrome="embedded"`.**

With the default `chrome="embedded"` the host supplies the header, yet `Gate`
still renders its own badge, wordmark, and tagline, so a host with a masthead
shows the brand name twice. The gate wrapper is also `min-height: 100vh` with
its own radial background, which under an existing hero reads as a second
full-screen panel.

Because those are inline styles, overriding them from the host needs
`!important`, and the brand box has no class to target (we match it via
`> div:has(> .cl-rootBox) > div:first-child`).

**Suggested fix:** have `chrome="embedded"` skip the gate's brand box and drop
the `100vh` framing, or give both a stable class.

---

## 6. Smaller notes

- **En dashes in packaged copy.** `copy.admin.availability.startHour` and
  `endHour` render `"Start hour (0–24)"`. Our brand standard prohibits em and en
  dashes, so both needed overriding. Worth using ASCII in default copy.
- **`GET /api/crm/records` 400s without `?type=`.** Reasonable, but the probe
  registered by `createChapterIntegration` expects 401, so an authenticated
  smoke check against the bare path looks like a failure.

## What went right

Worth saying, because most of it did:

- **`chapter.schema` was byte-identical** to the hand-written schema across all
  five namespaces and every attribute flag. The parity test passed first run,
  which is what made deleting the old schema safe.
- **`createChapterIntegration` replaced three provisioning paths** and installed
  the `crm_*` deny-all rules that we had previously skipped.
- The **member UI class contract matched exactly** (`card`, `member-row`,
  `role-badge`, `meeting-block`, `msched-*`), so `MembersArea` inherited an
  existing stylesheet with one rule changed.
- **`sends`, `operations`, `pipeline`, and `application` as config** captured
  every local decision that had been scattered across the worker's constants.
- Booking, Stripe, Clerk account creation, role promotion, the four lifecycle
  emails, and the audit log all worked end to end on the first deploy.
