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
  approve: { route: "approve", body: {}, outcome: "fit", label: "Approve", hint: "The welcome email goes out and the member area opens. If they bought a second seat, that gift invitation goes out too.", ask: "Approve this membership? The welcome email goes out and the member area opens.", yes: "approve", done: "Approved. The welcome email is on its way." },
  "not-paid-fit": { route: "refund", body: { continueAs: "associate" }, outcome: "not_paid_fit", label: "Not a paid fit", hint: "Full refund; they stay on as a free Associate.", ask: "Refund in full and keep them as an Associate? They keep member access on the free tier.", yes: "refund and keep as Associate", done: "Refunded, and kept as an Associate." },
  refund: { route: "refund", body: {}, outcome: "not_fit", label: "Refund and end", hint: "Full refund; the membership ends.", ask: "Refund in full and end this membership?", yes: "refund", done: "Refunded." },
  decline: { route: "decline", body: {}, outcome: "not_fit", label: "Decline", hint: "Nothing is emailed; tell them yourself.", ask: "Decline this application? Nothing is emailed; tell them yourself.", yes: "decline", done: "Declined." },
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
      setMessage({ ok: false, text: recorded ? `The call and the decision are recorded, but ${op.label} did not finish: ${err.message} Press Finish the call again to retry it.` : err.message });
    } finally {
      setSaving(false);
      load();
    }
  };
  const { canDecide, choices, callPanel, recordedPick } = decisionFor(labels, history);
  const chosen = pick || recordedPick;

  return (
    <div class="journey-tab" style="display:grid;gap:18px">
      {p && (
        <div role="region" aria-label="Proposed move" style="border:1px solid #B8925A;background:rgba(184,146,90,.12);border-radius:6px;padding:12px 14px;display:grid;gap:8px;max-width:620px">
          <div><b>Move to {p.label}?</b> <span class="muted">{p.reason}</span></div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn" disabled={saving} onClick={() => decide(ACTION_PATH, { action: p.action, method: "confirmed", evidence: p.evidence })}>Confirm</button>
            <button type="button" class="btn secondary" disabled={saving} onClick={() => decide(DISMISS_PATH, { action: p.action, evidence: p.evidence })}>Dismiss</button>
          </div>
        </div>
      )}
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <Chip k="Type" v={labels.typeLabel} />
        <Chip k="Path" v={labels.pathLabel} />
        <Chip k="Action" v={labels.actionLabel} strong />
        {labels.actionSince && <span class="muted" style="font-size:12.5px">since {day(labels.actionSince)}</span>}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12.5px">
        {labels.admission && <span class="crm-stage-chip">{ADMISSION[labels.admission]}{labels.waiverSource ? ` (${labels.waiverSource === "returning_member" ? "returning member" : "invitation"})` : ""}</span>}
        {labels.payment && <span class="crm-stage-chip">{PAYMENT[labels.payment]}</span>}
        {labels.revisitAt && <span class="crm-stage-chip">Revisit {day(labels.revisitAt)}</span>}
        {labels.flags.map((f) => <span class="pay-badge refunded" key={f}>{FLAG_LABELS[f] ?? f}</span>)}
      </div>

      {message && <div class={message.ok ? "muted" : "pay-badge refunded"} role="status" style="max-width:620px">{message.text}</div>}

      {callPanel && (
        <div role="region" aria-label="After the call" style="border:1px solid rgba(47,62,52,.2);border-radius:6px;padding:12px 14px;display:grid;gap:10px;max-width:620px">
          <div class="card-label" style="margin:0">After the call</div>
          {CALL_OUTCOMES.has(labels.action) && (
            <div class="muted" style="font-size:12.5px">The call and the decision ({labels.actionLabel}) are recorded; {OPERATIONS[recordedPick]?.label ?? "the decision"} has not finished yet.</div>
          )}
          {confirming && confirming !== "no-show" ? (
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <span>{OPERATIONS[confirming].ask}{CALL_OUTCOMES.has(labels.action) ? "" : " The call is recorded as held."}</span>
              <button type="button" class="btn" disabled={saving} onClick={() => operate(confirming)}>Yes, {OPERATIONS[confirming].yes}</button>
              <button type="button" class="btn secondary" disabled={saving} onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : confirming === "no-show" ? (
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <span>Mark the call as not having happened? They get an email to pick a new time.</span>
              <button type="button" class="btn" disabled={saving} onClick={() => decide(NO_SHOW_PATH, {}).then(() => setConfirming(null))}>Yes, invite to rebook</button>
              <button type="button" class="btn secondary" disabled={saving} onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <fieldset style="border:0;margin:0;padding:0;display:grid;gap:8px">
                <legend style="font-weight:700;margin-bottom:6px">The decision</legend>
                {choices.map((k) => (
                  <label key={k} style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:start;cursor:pointer">
                    <input type="radio" name={`call-decision-${recordId}`} value={k} checked={chosen === k} disabled={saving} onChange={() => setPick(k)} style="margin-top:4px" />
                    <span><b>{OPERATIONS[k].label}</b> <span class="muted" style="font-size:12.5px">{OPERATIONS[k].hint}</span></span>
                  </label>
                ))}
              </fieldset>
              <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
                <button type="button" class="btn" disabled={!chosen || saving} onClick={() => setConfirming(chosen)}>{saving ? "Saving…" : "Finish the call"}</button>
                {labels.action === "conversation_booked" && (
                  <button type="button" class="btn secondary" disabled={saving} onClick={() => setConfirming("no-show")}>The call didn't happen</button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!callPanel && canDecide && (
        <div role="region" aria-label="Decision" style="border:1px solid rgba(47,62,52,.2);border-radius:6px;padding:12px 14px;display:grid;gap:10px;max-width:620px">
          <div class="card-label" style="margin:0">Decision</div>
          {confirming ? (
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <span>{OPERATIONS[confirming].ask}</span>
              <button type="button" class="btn" disabled={saving} onClick={() => operate(confirming)}>Yes, {OPERATIONS[confirming].yes}</button>
              <button type="button" class="btn secondary" disabled={saving} onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : (
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              {choices.map((k, i) => <button type="button" key={k} class={i === 0 ? "btn" : "btn secondary"} disabled={saving} onClick={() => setConfirming(k)}>{OPERATIONS[k].label}</button>)}
            </div>
          )}
        </div>
      )}

      {options.length > 0 && (
        <div style="display:grid;gap:8px;max-width:520px">
          <label for={`journey-set-${recordId}`} style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Set action</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <select id={`journey-set-${recordId}`} value={choice} onChange={(e) => setChoice(e.target.value)} disabled={saving}>
              <option value="">Choose an action…</option>
              {options.map((o) => <option value={o.id} key={o.id}>{o.label}</option>)}
            </select>
            {choice === "keep_informed" && (
              <input type="date" value={revisit} onInput={(e) => setRevisit(e.target.value)} aria-label="Revisit on" />
            )}
            <button type="button" class="btn" onClick={save} disabled={!choice || saving}>{saving ? "Saving…" : "Set action"}</button>
          </div>
          <p class="muted" style="font-size:12.5px;margin:0">
            For relationship steps. A call and its decision are recorded together in After the call.
          </p>
        </div>
      )}

      <div>
        <div class="card-label">History</div>
        {!history.length ? (
          <div class="rec-empty">No history yet.</div>
        ) : (
          <ol style="list-style:none;margin:0;padding:0;display:grid;gap:6px">
            {history.slice().reverse().map((h) => (
              <li key={h.id} style="display:grid;grid-template-columns:170px 1fr;gap:10px;font-size:13px">
                <span class="muted">{when(h.occurredAt)}</span>
                <span>
                  {h.label}
                  <span class="muted"> · {METHOD[h.method] ?? h.method}{h.dateQuality === "estimated" ? " · estimated date" : ""}{h.reminderType ? ` · ${h.reminderType}` : ""}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Chip({ k, v, strong }) {
  return (
    <span class="crm-stage-chip" style={strong ? "font-weight:700" : ""}>
      <span class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-right:6px">{k}</span>
      {v || "Not set"}
    </span>
  );
}
