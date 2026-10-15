// The Action tab on a person in the admin console (Signup Journeys v3.1).
//
// Shows the three labels (Type, Path, Action), the facts that decide which
// steps apply (Admission, Payment), the flags, and the dated history of every
// event. Tori sets relationship steps here, and finishes a call in one place:
// she picks the decision, the call is recorded as held with it, and the
// application's own operation (approve, refund, decline) runs. The Approved,
// Refunded and Declined labels follow once that operation has finished.
//
// Data: GET/POST /api/admin/labels/person (src/labels-route.mjs).

import { useEffect, useState } from "preact/hooks";

const PERSON_PATH = "/api/admin/labels/person";
const ACTION_PATH = "/api/admin/labels/person/action";
const DISMISS_PATH = "/api/admin/labels/person/dismiss";
const NO_SHOW_PATH = "/api/admin/labels/person/no-show";
const OUTCOME_PATH = "/api/admin/labels/person/outcome";
const REFRESH_PATH = "/api/admin/labels/refresh";
// Where a decision can be made: after the call, or after payment on a waived path.
const DECIDABLE = new Set(["paid", "conversation_booked", "conversation_held", "fit", "not_fit", "not_paid_fit"]);
// The call steps live in the After the call panel only, never in the Set action list,
// so a call is always recorded together with its decision.
const CALL_STAGE = new Set(["conversation_booked", "conversation_held"]);
const CALL_OUTCOMES = new Set(["fit", "not_fit", "not_paid_fit"]);
const CALL_STEPS = new Set(["conversation_held", ...CALL_OUTCOMES]);
const DAY = 864e5;
// The operations behind the Decision panel: the Chapter route each one calls, the question asked first,
// the word on the Yes button, and what the panel says once it has finished. Not a paid fit is the
// refund with continueAs (Chapter 0.57.0): a full refund that keeps the person as a free Associate.
// Each also names the outcome recorded with the call (label) and how it reads as a choice.
const OPERATIONS = {
  approve: { route: "approve", body: {}, outcome: "fit", label: "Approve", hint: "The welcome email goes out and the member area opens. If they bought a second seat, the gift invitation goes out too.", ask: "Approve this membership?", detail: "The welcome email goes out and the member area opens.", yes: "Yes, approve", done: "Approved. The welcome email is on its way." },
  "not-paid-fit": { route: "refund", body: { continueAs: "associate" }, outcome: "not_paid_fit", label: "Not a paid fit", hint: "Full refund. They stay on as a free Associate.", ask: "Refund in full and keep them as an Associate?", detail: "They keep member access on the free tier.", yes: "Yes, refund and keep", done: "Refunded. They stay on as an Associate." },
  refund: { route: "refund", body: {}, outcome: "not_fit", label: "Refund and close", hint: "Full refund. The membership ends.", ask: "Refund in full and close this membership?", detail: "Their member access ends.", yes: "Yes, refund and close", done: "Refunded. The membership is closed." },
  decline: { route: "decline", body: {}, outcome: "not_fit", label: "Decline", hint: "No email goes out. Let them know yourself.", ask: "Decline this application?", detail: "No email goes out. Let them know yourself.", yes: "Yes, decline", done: "Declined." },
};

// Insert the Action tab first on person records, so the labels are the first
// thing Tori sees on opening someone.
export function withActionTab(tabs, context) {
  if (context.type !== "person") return tabs;
  const tab = { id: "journey", label: "Action", panel: <ActionTab recordId={context.detail.record.id} /> };
  return [tab, ...tabs];
}

/**
 * What the decision panel offers this person: the choices, whether it is the
 * After the call panel, and the choice an already recorded outcome stands for.
 */
export function decisionFor(labels, history) {
  const canDecide = !!labels.applicationId && DECIDABLE.has(labels.action);
  // Decline is for people who hold no payment: Associates, and paid-tier applicants who never paid
  // (Chapter refuses it with payment_held otherwise). Not a paid fit is the refund that keeps them.
  const paid = labels.payment === "required" && history.some((h) => h.event === "paid");
  const choices = canDecide ? (paid ? ["approve", "not-paid-fit", "refund"] : ["approve", "decline"]) : [];
  // After the call: the call is booked or held, or its outcome is recorded and the operation has not finished yet.
  const callPanel = canDecide && labels.admission === "call_required" && (CALL_STAGE.has(labels.action) || CALL_OUTCOMES.has(labels.action));
  // An outcome already recorded picks its operation, so a retry needs one click.
  const recordedPick = { fit: "approve", not_paid_fit: "not-paid-fit", not_fit: paid ? "refund" : "decline" }[labels.action] ?? "";
  return { canDecide, paid, choices, callPanel, recordedPick };
}

// The site's own fetch with the Clerk session token, keeping the server's
// error message (window.SSCAuth.api drops it).
async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  try {
    const token = await window.Clerk?.session?.getToken();
    if (token) headers.authorization = "Bearer " + token;
  } catch { /* the request answers 401 and the tab says so */ }
  if (opts.body) headers["content-type"] = "application/json";
  const res = await fetch(path, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const when = (ms) =>
  ms ? new Date(ms).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const day = (ms) => (ms ? new Date(ms).toLocaleDateString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", year: "numeric" }) : "");
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

const FLAG_LABELS = {
  "flag:needs-to-pay": "Needs to pay",
  "flag:needs-to-book": "Needs to book",
  "flag:reminded": "Reminded",
  "flag:outcome-due": "Outcome due",
  "flag:attendance-unconfirmed": "Attendance unconfirmed",
  "flag:revisit-due": "Revisit due",
  "flag:payment-failed": "Payment failed",
  "flag:cancels-at-term-end": "Cancels at term end",
  "flag:waiting-on-buyer": "Waiting on buying member",
  "flag:move-to-confirm": "Move to confirm",
};
const ADMISSION = { call_required: "Call required", call_waived: "Call waived" };
const PAYMENT = { required: "Payment required", not_required: "No payment" };
const METHOD = { manual: "set by hand", confirmed: "confirmed", automatic: "automatic" };

function ActionTab({ recordId }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [choice, setChoice] = useState("");
  const [revisit, setRevisit] = useState(isoDay(Date.now() + 90 * DAY));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [pick, setPick] = useState("");

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    request(`${PERSON_PATH}?recordId=${encodeURIComponent(recordId)}`)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  };
  useEffect(load, [recordId]);

  if (state.loading && !state.data) return <div class="rec-empty">Loading…</div>;
  if (state.error) return <div class="rec-empty">The labels could not be loaded. {state.error.message}</div>;
  const { labels, history, updatedAt } = state.data;
  const options = state.data.options.filter((o) => !CALL_STEPS.has(o.id));

  const save = async () => {
    if (!choice) return;
    setSaving(true);
    setMessage(null);
    try {
      const body = { recordId, action: choice, expectedUpdatedAt: updatedAt };
      if (choice === "keep_informed" && revisit) body.revisitAt = Date.parse(revisit + "T12:00:00Z");
      await request(ACTION_PATH, { method: "POST", body: JSON.stringify(body) });
      setChoice("");
      setMessage({ ok: true, text: "Saved." });
      load();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const decide = async (path, body) => {
    setSaving(true);
    setMessage(null);
    try {
      await request(path, { method: "POST", body: JSON.stringify({ recordId, expectedUpdatedAt: updatedAt, ...body }) });
      setMessage({ ok: true, text: "Saved." });
      load();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };
  const p = labels.proposal;
  // Approve, Decline, Refund and Not a paid fit run the application's own
  // operations (Chapter 0.57.0), then bring the labels up to date at once. The
  // label only moves once the operation has finished, exactly as when the
  // five-minute job sees it.
  //
  // Finishing a call records the call and its outcome first (one request, so
  // neither can be skipped), then runs the operation. If the operation fails,
  // the outcome stays recorded and Finish runs only the operation again.
  const operate = async (kind) => {
    setSaving(true);
    setMessage(null);
    setConfirming(null);
    const op = OPERATIONS[kind];
    let recorded = false;
    try {
      if (callPanel) {
        await request(OUTCOME_PATH, { method: "POST", body: JSON.stringify({ recordId, outcome: op.outcome, expectedUpdatedAt: updatedAt }) });
        recorded = true;
      }
      await request(`/api/admin/applications/${labels.applicationId}/${op.route}`, { method: "POST", body: JSON.stringify(op.body) });
      await request(REFRESH_PATH, { method: "POST", body: "{}" });
      setMessage({ ok: true, text: op.done });
      setPick("");
    } catch (err) {
      setMessage({ ok: false, text: recorded ? `Your decision is saved, but ${op.label} did not finish: ${err.message} Press Save decision to try again.` : err.message });
    } finally {
      setSaving(false);
      load();
    }
  };
  const { canDecide, choices, callPanel, recordedPick } = decisionFor(labels, history);
  const chosen = pick || recordedPick;

  const ask = confirming && confirming !== "no-show" ? OPERATIONS[confirming] : null;
  const choicesView = (
    <fieldset class="jt-options">
      <legend class="jt-legend">What happens next</legend>
      {choices.map((k) => (
        <label key={k} class={`jt-option${chosen === k ? " is-on" : ""}`}>
          <input type="radio" name={`call-decision-${recordId}`} value={k} checked={chosen === k} disabled={saving} onChange={() => setPick(k)} />
          <span><b>{OPERATIONS[k].label}</b><span class="jt-hint">{OPERATIONS[k].hint}</span></span>
        </label>
      ))}
    </fieldset>
  );
  const confirmView = ask ? (
    <div class="jt-confirm" role="alertdialog" aria-label={ask.ask}>
      <b>{ask.ask}</b>
      <span class="jt-hint">{ask.detail}{callPanel && !CALL_OUTCOMES.has(labels.action) ? " The call is saved as held." : ""}</span>
      <div class="jt-actions">
        <button type="button" class="btn" disabled={saving} onClick={() => operate(confirming)}>{saving ? "Saving…" : ask.yes}</button>
        <button type="button" class="btn secondary" disabled={saving} onClick={() => setConfirming(null)}>Go back</button>
      </div>
    </div>
  ) : confirming === "no-show" ? (
    <div class="jt-confirm" role="alertdialog" aria-label="Mark the call as missed?">
      <b>Mark the call as missed?</b>
      <span class="jt-hint">They get an email with a link to pick a new time.</span>
      <div class="jt-actions">
        <button type="button" class="btn" disabled={saving} onClick={() => decide(NO_SHOW_PATH, {}).then(() => setConfirming(null))}>{saving ? "Sending…" : "Yes, send the rebooking email"}</button>
        <button type="button" class="btn secondary" disabled={saving} onClick={() => setConfirming(null)}>Go back</button>
      </div>
    </div>
  ) : null;

  return (
    <div class="journey-tab jt">
      <style>{JT_CSS}</style>

      <div class="jt-summary">
        <div class="jt-chips">
          <Chip k="Type" v={labels.typeLabel} />
          <Chip k="Path" v={labels.pathLabel} />
          <Chip k="Action" v={labels.actionLabel} strong />
          {labels.actionSince && <span class="jt-since">since {day(labels.actionSince)}</span>}
        </div>
        <div class="jt-tags">
          {labels.admission && <span class="jt-tag">{ADMISSION[labels.admission]}{labels.waiverSource ? ` (${labels.waiverSource === "returning_member" ? "returning member" : "invitation"})` : ""}</span>}
          {labels.payment && <span class="jt-tag">{PAYMENT[labels.payment]}</span>}
          {labels.revisitAt && <span class="jt-tag">Revisit {day(labels.revisitAt)}</span>}
          {labels.flags.map((f) => <span class="jt-tag is-flag" key={f}>{FLAG_LABELS[f] ?? f}</span>)}
        </div>
      </div>

      {message && <div class={`jt-message${message.ok ? "" : " is-error"}`} role="status">{message.text}</div>}

      {p && (
        <section class="jt-card is-suggest" aria-label="Suggested update">
          <div class="jt-title">Suggested update</div>
          <p class="jt-lead">Move to <b>{p.label}</b>? <span class="jt-hint">{p.reason}</span></p>
          <div class="jt-actions">
            <button type="button" class="btn" disabled={saving} onClick={() => decide(ACTION_PATH, { action: p.action, method: "confirmed", evidence: p.evidence })}>Confirm</button>
            <button type="button" class="btn secondary" disabled={saving} onClick={() => decide(DISMISS_PATH, { action: p.action, evidence: p.evidence })}>Dismiss</button>
          </div>
        </section>
      )}

      {callPanel && (
        <section class="jt-card" aria-label="After the call">
          <div class="jt-title">After the call</div>
          <p class="jt-lead">
            {CALL_OUTCOMES.has(labels.action)
              ? `Your decision (${labels.actionLabel}) is saved, but ${OPERATIONS[recordedPick]?.label ?? "it"} has not finished. Save decision to try again.`
              : "How did it go? Choose what happens next. Saving records the call as held."}
          </p>
          {confirmView ?? (
            <>
              {choicesView}
              <div class="jt-actions">
                <button type="button" class="btn" disabled={!chosen || saving} onClick={() => setConfirming(chosen)}>{saving ? "Saving…" : "Save decision"}</button>
                {labels.action === "conversation_booked" && (
                  <button type="button" class="btn secondary" disabled={saving} onClick={() => setConfirming("no-show")}>They missed the call</button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {!callPanel && canDecide && (
        <section class="jt-card" aria-label="Decision">
          <div class="jt-title">Decision</div>
          {confirmView ?? (
            <>
              {choicesView}
              <div class="jt-actions">
                <button type="button" class="btn" disabled={!chosen || saving} onClick={() => setConfirming(chosen)}>{saving ? "Saving…" : "Save decision"}</button>
              </div>
            </>
          )}
        </section>
      )}

      {options.length > 0 && (
        <section class="jt-card is-quiet" aria-label="Update the relationship">
          <label class="jt-title" for={`journey-set-${recordId}`}>Update the relationship</label>
          <p class="jt-hint">For steps before they apply. A call and its decision are saved together in After the call.</p>
          <div class="jt-actions">
            <select id={`journey-set-${recordId}`} class="jt-select" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={saving}>
              <option value="">Choose a step…</option>
              {options.map((o) => <option value={o.id} key={o.id}>{o.label}</option>)}
            </select>
            {choice === "keep_informed" && (
              <input type="date" class="jt-select" value={revisit} onInput={(e) => setRevisit(e.target.value)} aria-label="Revisit on" />
            )}
            <button type="button" class="btn" onClick={save} disabled={!choice || saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </section>
      )}

      <section class="jt-history" aria-label="History">
        <div class="jt-title">History</div>
        {!history.length ? (
          <p class="jt-hint">No history yet.</p>
        ) : (
          <ol>
            {history.slice().reverse().map((h) => (
              <li key={h.id}>
                <span class="jt-when">{when(h.occurredAt)}</span>
                <span>
                  {h.label}
                  <span class="jt-hint"> · {METHOD[h.method] ?? h.method}{h.dateQuality === "estimated" ? " · estimated date" : ""}{h.reminderType ? ` · ${h.reminderType}` : ""}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

// The tab's look, from the admin theme's own tokens (the salt theme: moss,
// cream, sand, teal), with fallbacks so it reads the same anywhere.
const JT_CSS = `
.jt{display:grid;gap:16px;max-width:680px;color:var(--ui-text,#2F3E34);font-size:14px}
.jt-summary{display:grid;gap:8px}
.jt-chips,.jt-tags,.jt-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.jt-chip{display:inline-flex;align-items:baseline;gap:6px;padding:5px 12px;border-radius:999px;background:var(--ui-surface-2,#F4EFE6);font-size:13.5px}
.jt-chip i{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ui-text-muted,#7E8E84)}
.jt-chip.is-strong{background:var(--ui-accent-strong,#2F3E34);color:var(--ui-bg,#FBF8F2)}
.jt-chip.is-strong i{color:rgba(251,248,242,.7)}
.jt-since{font-size:12.5px;color:var(--ui-text-muted,#7E8E84)}
.jt-tag{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--ui-border,rgba(47,62,52,.14));color:var(--ui-text-muted,#4A5E50);background:var(--ui-surface,#fff)}
.jt-tag.is-flag{border-color:rgba(209,107,79,.45);background:rgba(209,107,79,.08);color:#B4553B;font-weight:600}
.jt-card{display:grid;gap:12px;padding:18px 20px;border-radius:12px;background:var(--ui-surface,#fff);border:1px solid var(--ui-border,rgba(47,62,52,.14));box-shadow:0 1px 2px rgba(47,62,52,.05),0 6px 20px rgba(47,62,52,.06)}
.jt-card.is-suggest{border-color:rgba(184,146,90,.55);background:rgba(184,146,90,.08);box-shadow:none}
.jt-card.is-quiet{box-shadow:none;background:transparent}
.jt-title{font-family:var(--ui-font-display,"Cormorant Garamond",Georgia,serif);font-size:22px;font-weight:600;line-height:1.1;color:var(--ui-text,#2F3E34)}
.jt-lead{margin:0;line-height:1.5}
.jt-hint{display:block;font-size:12.5px;line-height:1.45;color:var(--ui-text-muted,#7E8E84);margin:0}
.jt-lead .jt-hint,.jt-history .jt-hint{display:inline}
.jt-options{border:0;margin:0;padding:0;display:grid;gap:8px}
.jt-legend{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ui-text-muted,#7E8E84);margin-bottom:6px;padding:0}
.jt-option{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:start;padding:12px 14px;border-radius:10px;border:1px solid var(--ui-border,rgba(47,62,52,.14));cursor:pointer;transition:border-color .15s,background .15s}
.jt-option:hover{border-color:var(--ui-border-strong,rgba(47,62,52,.3))}
.jt-option.is-on{border-color:var(--ui-accent-2,#1A8F7D);background:rgba(26,143,125,.07);box-shadow:inset 0 0 0 1px var(--ui-accent-2,#1A8F7D)}
.jt-option input{margin-top:3px;accent-color:var(--ui-accent-2,#1A8F7D)}
.jt-option b{display:block;font-size:15px}
.jt-confirm{display:grid;gap:6px;padding:14px 16px;border-radius:10px;background:var(--ui-surface-2,#F4EFE6)}
.jt-confirm .jt-actions{margin-top:6px}
.jt-message{font-size:13px;padding:10px 14px;border-radius:10px;background:rgba(26,143,125,.08);color:#146E60}
.jt-message.is-error{background:rgba(209,107,79,.1);color:#9C4430}
.jt-select{font:inherit;padding:7px 10px;border-radius:8px;border:1px solid var(--ui-border-strong,rgba(47,62,52,.3));background:var(--ui-surface,#fff);color:inherit}
.jt-history ol{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:0}
.jt-history li{display:grid;grid-template-columns:170px 1fr;gap:12px;font-size:13px;padding:8px 0;border-bottom:1px solid var(--ui-border,rgba(47,62,52,.08))}
.jt-when{color:var(--ui-text-muted,#7E8E84);font-variant-numeric:tabular-nums}
.jt .btn{font:inherit;font-size:14px;font-weight:700;padding:9px 18px;border-radius:999px;border:1px solid var(--ui-accent-strong,#2F3E34);background:var(--ui-accent-strong,#2F3E34);color:var(--ui-bg,#FBF8F2);cursor:pointer;transition:opacity .15s}
.jt .btn.secondary{background:transparent;color:var(--ui-text,#2F3E34);border-color:var(--ui-border-strong,rgba(47,62,52,.3))}
.jt .btn:hover:not(:disabled){opacity:.88}
.jt .btn:disabled{opacity:.4;cursor:default}
.jt .btn:focus-visible,.jt-option:has(input:focus-visible){outline:2px solid var(--ui-accent-2,#1A8F7D);outline-offset:2px}
@media (max-width:560px){.jt-history li{grid-template-columns:1fr;gap:2px}}
`;

function Chip({ k, v, strong }) {
  return (
    <span class={`jt-chip${strong ? " is-strong" : ""}`}>
      <i>{k}</i>
      {v || "Not set"}
    </span>
  );
}
