// The Action tab on a person in the admin console (Signup Journeys v3.1).
//
// Shows the three labels (Type, Path, Action), the facts that decide which
// steps apply (Admission, Payment), the flags, and the dated history of every
// event. Tori sets relationship steps and outcomes here. Approval and refunds
// are not set here: they are done with the application's own buttons, and the
// labels job records them once they have actually happened.
//
// Data: GET/POST /api/admin/labels/person (src/labels-route.mjs).

import { useEffect, useState } from "preact/hooks";

const PERSON_PATH = "/api/admin/labels/person";
const ACTION_PATH = "/api/admin/labels/person/action";
const DAY = 864e5;

// Insert the Action tab first on person records, so the labels are the first
// thing Tori sees on opening someone.
export function withActionTab(tabs, context) {
  if (context.type !== "person") return tabs;
  const tab = { id: "journey", label: "Action", panel: <ActionTab recordId={context.detail.record.id} /> };
  return [tab, ...tabs];
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

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    request(`${PERSON_PATH}?recordId=${encodeURIComponent(recordId)}`)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  };
  useEffect(load, [recordId]);

  if (state.loading && !state.data) return <div class="rec-empty">Loading…</div>;
  if (state.error) return <div class="rec-empty">The labels could not be loaded. {state.error.message}</div>;
  const { labels, history, options, updatedAt } = state.data;

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

  return (
    <div class="journey-tab" style="display:grid;gap:18px">
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
        {message && <div class={message.ok ? "muted" : "pay-badge refunded"} role="status">{message.text}</div>}
        <p class="muted" style="font-size:12.5px;margin:0">
          Approve and Refund are done with the application's own buttons; the Action follows once they have finished. Decline and Not a paid fit arrive when Cory ships them.
        </p>
      </div>

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
