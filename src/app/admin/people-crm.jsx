// People tab, rebuilt on @odla-ai/crm. Each person is a crm_record (type
// "person") projected one-way from applications + $users by the worker
// (src/crm-sync.mjs). This surface adds what the old table couldn't: tags,
// notes, follow-up tasks, contact-consent, saved views, and audited email
// (free-form or template) from a single record panel.
//
// The hybrid invariant: applications.status stays authoritative. Lifecycle
// actions here (Approve / Refund / stage moves) call the EXISTING
// /api/admin/applications/:id routes; the worker then mirrors the change back
// into crm_record.stage. We never drive raw CRM setStage for a person that has
// an application.
import { useState, useEffect, useCallback } from "preact/hooks";
import { CrmClient } from "@odla-ai/crm";
import {
  ActivityFeed,
  FieldsForm,
  StageControl,
  TagEditor,
  IdentityCard,
  BillingCard,
  useCrmQuery,
  useCrmRecord,
} from "@odla-ai/crm/ui";
import { crm, PERSON_STAGES } from "../../crm.mjs";
import { api, bus, ROLES, STATUS_LABELS, APPROVABLE, fmtTzTime } from "../lib.js";
import { SlotPicker } from "../slot-picker.jsx";

// Stage filter chips for the exploration rail: "All" plus each pipeline stage.
const STAGE_FILTERS = [{ id: "", label: "All" }, ...PERSON_STAGES.map((id) => ({ id, label: STATUS_LABELS[id] || id }))];

// The exploration rail: search + stage filters + a compact, role-styled list.
// Data (search/filter/pagination) comes from useCrmQuery; role comes from the
// roleMap (email -> Clerk role) so admins/members are highlighted, and the open
// person's row is marked active.
function PeopleRail({ query, roleMap, openId, onOpen }) {
  const page = query.page;
  const records = page?.records || [];
  const activeStage = (query.params.stage && query.params.stage[0]) || "";

  return (
    <div class="rail">
      <input
        class="rail-search"
        type="search"
        placeholder="Search people…"
        value={query.params.search || ""}
        onInput={(e) => query.setSearch(e.currentTarget.value)}
      />
      <div class="rail-stages">
        {STAGE_FILTERS.map((s) => (
          <button
            type="button"
            class={"rail-chip" + (activeStage === s.id ? " on" : "")}
            onClick={() => query.update({ stage: s.id ? [s.id] : undefined })}
          >{s.label}</button>
        ))}
      </div>

      {query.loading && !records.length ? (
        <div class="rail-note"><span class="spinner"></span> Loading people…</div>
      ) : !records.length ? (
        <div class="rail-note">No people match.</div>
      ) : (
        <ul class="rail-list">
          {records.map((r) => {
            const role = roleMap.get((r.primaryEmail || "").toLowerCase());
            return (
              <li key={r.id}>
                <button
                  type="button"
                  class={"rail-row" + (r.id === openId ? " active" : "")}
                  onClick={() => onOpen(r.id)}
                >
                  <span class="rail-row-top">
                    <span class={"rail-name" + (role === "admin" ? " role-admin" : "")}>
                      {r.name || r.primaryEmail || "(no name)"}
                    </span>
                    {role === "admin" && <span class="role-badge admin">Admin</span>}
                    {role === "member" && <span class="role-badge member">Member</span>}
                  </span>
                  <span class="rail-sub">
                    <span class="rail-email">{r.primaryEmail || ""}</span>
                    {r.stage && <span class="rail-status">{STATUS_LABELS[r.stage] || r.stage}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {page && page.total > page.limit && (
        <div class="rail-pager">
          <button type="button" disabled={page.offset <= 0}
            onClick={() => query.setOffset(Math.max(0, page.offset - page.limit))}>Prev</button>
          <span>{page.offset + 1}–{Math.min(page.offset + page.limit, page.total)} of {page.total}</span>
          <button type="button" disabled={page.offset + page.limit >= page.total}
            onClick={() => query.setOffset(page.offset + page.limit)}>Next</button>
        </div>
      )}
    </div>
  );
}

// Same Clerk bearer the rest of the console uses, fetched per request.
const client = new CrmClient({
  headers: async () => {
    const t = await window.Clerk?.session?.getToken?.();
    return t ? { authorization: `Bearer ${t}` } : {};
  },
});

const MEMBERS_URL = () => location.origin + "/members/";
const firstNameOf = (record) =>
  (record.fields && record.fields.firstName) || (record.name || "").split(" ")[0] || "there";

// ── Lifecycle actions: reuse the operational endpoints (people.jsx parity) ──
function LifecycleActions({ record, onChanged }) {
  const appId = record.fields && record.fields.applicationId;
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState(null);
  if (!appId) return <p class="muted" style="margin:0 0 12px">No application on file, so payment and approval actions do not apply.</p>;

  const stage = record.stage;
  const approvable = APPROVABLE.includes(stage);
  const refundable = record.billingStatus === "active" && !["approved", "refunded"].includes(stage);

  const run = async (kind, url, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(kind);
    setErr(null);
    try {
      await api(url, { method: "POST", body: "{}" });
      // The worker mirrors the new status into crm_record; nudge the console.
      bus.dispatchEvent(new Event("people:reload"));
      await onChanged();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div class="crm-lifecycle">
      <span class="crm-stage-chip">{STATUS_LABELS[stage] || stage || "—"}</span>
      {approvable && (
        <button class="row-save row-approve" disabled={busy === "approve"}
          onClick={() => run("approve", `/api/admin/applications/${appId}/approve`)}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
      )}
      {refundable && (
        <button class="row-save row-refund" disabled={busy === "refund"}
          onClick={() => run("refund", `/api/admin/applications/${appId}/refund`,
            "Refund this member in full and cancel their subscription? This is the non-fit action.")}>
          {busy === "refund" ? "Refunding…" : "Refund"}
        </button>
      )}
      {err && <span class="crm-error">{err}</span>}
    </div>
  );
}

// ── Email composer: free-form (personal / announcement) or a saved template ──
function EmailComposer({ record }) {
  const [mode, setMode] = useState("free"); // "free" | "template"
  const [cls, setCls] = useState("personal"); // free-form class -> template id
  const [templateId, setTemplateId] = useState("check_in");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const consent = record.emailStatus; // ok | unsubscribed | bounced | suppressed | none
  const consentNote =
    consent === "ok" ? null
    : consent === "unsubscribed" ? "Unsubscribed: marketing sends are blocked; a personal (transactional) note still delivers."
    : consent === "none" ? "No email channel on file yet."
    : consent === "bounced" ? "This address hard-bounced; sends are blocked."
    : consent === "suppressed" ? "This address is suppressed; sends are blocked."
    : null;

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const firstName = firstNameOf(record);
      let payload;
      if (mode === "free") {
        if (!subject.trim() || !body.trim()) { setResult("Add a subject and a message first."); setSending(false); return; }
        payload = { templateId: cls, vars: { firstName, subject, body } };
      } else {
        payload = { templateId, vars: { firstName, membersUrl: MEMBERS_URL() } };
      }
      const res = await client.sendEmail(record.id, payload);
      setResult(res.sent ? "Sent ✓" : `Not sent: ${res.reason || "blocked"}`);
      if (res.sent) { setSubject(""); setBody(""); }
      bus.dispatchEvent(new Event("emaillog:reload"));
    } catch (e) {
      setResult("Error: " + (e.message || String(e)));
    } finally {
      setSending(false);
    }
  };

  return (
    <div class="crm-email card-inner">
      <div class="card-label">Send email</div>
      <div class="crm-seg">
        <button class={mode === "free" ? "on" : ""} onClick={() => setMode("free")}>Write a message</button>
        <button class={mode === "template" ? "on" : ""} onClick={() => setMode("template")}>Use a template</button>
      </div>
      {mode === "free" ? (
        <>
          <label class="crm-field">
            <span>Kind</span>
            <select value={cls} onChange={(e) => setCls(e.currentTarget.value)}>
              <option value="personal">Personal note (transactional)</option>
              <option value="announcement">Announcement (marketing, adds unsubscribe)</option>
            </select>
          </label>
          <label class="crm-field"><span>Subject</span>
            <input type="text" value={subject} onInput={(e) => setSubject(e.currentTarget.value)} placeholder="Subject" />
          </label>
          <label class="crm-field"><span>Message</span>
            <textarea rows="5" value={body} onInput={(e) => setBody(e.currentTarget.value)} placeholder={`Hi ${firstNameOf(record)},`}></textarea>
          </label>
        </>
      ) : (
        <label class="crm-field"><span>Template</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.currentTarget.value)}>
            <option value="check_in">Check-in note</option>
          </select>
        </label>
      )}
      {consentNote && <p class="crm-consent-note">{consentNote}</p>}
      <div class="crm-email-actions">
        <button class="row-save" disabled={sending} onClick={send}>{sending ? "Sending…" : "Send"}</button>
        {result && <span class="crm-email-result">{result}</span>}
      </div>
    </div>
  );
}

// ── Access card: promote/change a person's role. Super-admin-only (the whole
// card is hidden otherwise). Super-admin itself is set only in odla Studio and
// is never editable here; the server enforces the same rules.
function AccessCard({ clerkUserId, myUserId, currentRole }) {
  const [role, setRole] = useState(currentRole || "provisional");
  const [savedRole, setSavedRole] = useState(currentRole || "provisional");
  const [targetSuper, setTargetSuper] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const isSelf = clerkUserId === myUserId;

  // Show the role we already know (from the People list) immediately, then
  // refine the authoritative role + target super-admin status in the
  // background. The card never blocks on "Loading…"; a lookup failure just
  // leaves the known role in place.
  useEffect(() => {
    setRole(currentRole || "provisional");
    setSavedRole(currentRole || "provisional");
    setMsg(null);
    api(`/api/admin/people/access?userId=${encodeURIComponent(clerkUserId)}`)
      .then((a) => { setRole(a.role); setSavedRole(a.role); setTargetSuper(a.superAdmin === true); })
      .catch(() => {});
  }, [clerkUserId, currentRole]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api("/api/admin/people/role", { method: "POST", body: JSON.stringify({ userId: clerkUserId, role }) });
      setSavedRole(role);
      setMsg("Saved ✓");
      bus.dispatchEvent(new Event("people:reload"));
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="card-inner">
      <div class="card-label">Access</div>
      {targetSuper && (
        <p class="crm-consent-note">Super-admin (set in odla Studio). Managed there, not here.</p>
      )}
      <label class="crm-field">
        <span>Role</span>
        <select value={role} disabled={isSelf || targetSuper || saving}
          onChange={(e) => setRole(e.currentTarget.value)}>
          {ROLES.map((r) => <option value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </label>
      {isSelf && <p class="muted" style="font-size:12px;margin:-4px 0 10px">You cannot change your own role.</p>}
      <div class="crm-email-actions">
        <button class="row-save" disabled={saving || isSelf || targetSuper || role === savedRole} onClick={save}>
          {saving ? "Saving…" : "Save role"}
        </button>
        {msg && <span class="crm-email-result">{msg}</span>}
      </div>
    </div>
  );
}

// ── Comms History tab: the audited email log for this person. ──
function CommsHistory({ recordId }) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    client.emailLog({ recordId, limit: 50 }).then((r) => setLog(r.log || [])).catch(() => setLog([]));
  }, [recordId]);
  if (!log) return <p class="muted"><span class="spinner"></span> Loading…</p>;
  if (!log.length) return <p class="muted">No emails sent to this person yet.</p>;
  return (
    <ul class="rec-log">
      {log.map((e) => (
        <li class="rec-log-row">
          <span class="rec-log-subj">{e.subject || "(no subject)"}</span>
          <span class="rec-log-meta">
            {e.templateId} · {new Date(e.sentAt).toLocaleString()} · {e.error ? "failed" : e.transport}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Scheduling tab: this person's intro call, with reschedule / cancel. ──
function Scheduling({ appId, onChanged }) {
  const [meeting, setMeeting] = useState(undefined); // undefined = loading
  const [tz, setTz] = useState("");
  const [slots, setSlots] = useState(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    if (!appId) { setMeeting(null); return; }
    api("/api/admin/meetings?all=1").then((res) => {
      setTz(res.timezone || "");
      const m = (res.meetings || []).find((x) => x.applicant && x.applicant.id === appId && x.status !== "cancelled");
      setMeeting(m || null);
    }).catch(() => setMeeting(null));
  }, [appId]);
  useEffect(() => { load(); }, [load]);

  const cancel = async () => {
    if (!confirm("Cancel this intro call? Google notifies the attendee.")) return;
    setBusy("cancel"); setMsg(null);
    try { await api(`/api/admin/meetings/${meeting.id}/cancel`, { method: "POST", body: "{}" }); onChanged?.(); load(); }
    catch (e) { setMsg(e.message || String(e)); } finally { setBusy(""); }
  };
  const startReschedule = async () => {
    setRescheduling(true); setSlots(null);
    try { const r = await api("/api/schedule/slots"); setSlots(r.slots || []); if (r.timezone) setTz(r.timezone); }
    catch { setSlots([]); }
  };
  const pick = async (slot) => {
    setBusy("reschedule"); setMsg(null);
    try {
      await api(`/api/admin/meetings/${meeting.id}/reschedule`, { method: "POST", body: JSON.stringify({ startAt: slot.startAt }) });
      setRescheduling(false); onChanged?.(); load();
    } catch (e) { setMsg(e.message || String(e)); } finally { setBusy(""); }
  };

  if (!appId) return <p class="muted">No application on file, so no intro call.</p>;
  if (meeting === undefined) return <p class="muted"><span class="spinner"></span> Loading…</p>;
  if (!meeting) return <p class="muted">No intro call booked.</p>;
  return (
    <div>
      <p class="rec-when">{fmtTzTime(meeting.startAt, tz)}</p>
      {meeting.drift && meeting.drift !== "none" && (
        <p class="crm-consent-note">Calendar drift: {meeting.drift} (reconciled from Google).</p>
      )}
      <div class="crm-email-actions" style="margin-bottom:14px">
        {meeting.meetUrl && <a class="row-save" href={meeting.meetUrl} target="_blank" rel="noopener">Join Meet</a>}
        {meeting.htmlLink && <a class="dash-agenda-link" href={meeting.htmlLink} target="_blank" rel="noopener">Google Calendar</a>}
      </div>
      {!rescheduling ? (
        <div class="crm-email-actions">
          <button class="row-save" onClick={startReschedule}>Reschedule</button>
          <button class="row-save row-refund" disabled={busy === "cancel"} onClick={cancel}>{busy === "cancel" ? "Cancelling…" : "Cancel call"}</button>
          {msg && <span class="crm-error">{msg}</span>}
        </div>
      ) : slots === null ? (
        <p class="muted"><span class="spinner"></span> Loading slots…</p>
      ) : !slots.length ? (
        <p class="muted">No open slots right now.</p>
      ) : (
        <div class="resched-cell">
          <SlotPicker slots={slots} timezone={tz}
            classes={{ days: "resched-days", day: "resched-day", times: "resched-times", time: "resched-time" }}
            onPick={pick} />
          <div class="crm-email-actions" style="margin-top:10px">
            <button class="row-save" onClick={() => setRescheduling(false)}>Cancel reschedule</button>
            {busy === "reschedule" && <span class="muted">Rescheduling…</span>}
            {msg && <span class="crm-error">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── One person's detail, organized into sub-tabs. ──
const REC_TABS = [
  ["stage", "Stage"],
  ["info", "Info"],
  ["comms", "Comms"],
  ["history", "Comms history"],
  ["scheduling", "Scheduling"],
  ["billing", "Billing"],
  ["notes", "Notes"],
];

function RecordDrawer({ id, onClose, onChanged, superAdmin, myUserId, roleMap }) {
  const state = useCrmRecord(client, id);
  const [subtab, setSubtab] = useState("stage");
  const [saving, setSaving] = useState(false);
  const [acts, setActs] = useState([]);
  const [optimisticStage, setOptimisticStage] = useState(null);

  const reloadActs = useCallback(() => {
    client.listActivities(id).then((r) => setActs(r.activities || [])).catch(() => {});
  }, [id]);
  useEffect(() => { reloadActs(); }, [reloadActs]);
  // Reset to the Info tab whenever a different person is opened.
  useEffect(() => { setSubtab("stage"); setOptimisticStage(null); }, [id]);
  // Clear the optimistic stage once the refreshed record actually shows it.
  useEffect(() => {
    if (optimisticStage && state.detail?.record?.stage === optimisticStage) setOptimisticStage(null);
  }, [state.detail, optimisticStage]);

  // Keep the detail rendered across refreshes (show loading/error only before
  // the first successful load) so an in-place action never flashes the pane.
  if (state.error && !state.detail) return <div class="card"><p class="crm-error">Could not load this record: {state.error}</p><button class="row-save" onClick={onClose}>Close</button></div>;
  if (!state.detail) return <div class="card"><span class="spinner"></span> Loading record…</div>;

  const { record } = state.detail;
  const appId = record.fields && record.fields.applicationId;
  const stageRecord = optimisticStage
    ? { ...record, stage: optimisticStage, stageIndex: crm.stageIndex("person", optimisticStage) }
    : record;
  const afterChange = async () => { state.refresh(); onChanged(); };

  const onSaveFields = async (input) => {
    setSaving(true);
    try { await client.updateRecord(id, { input }); state.refresh(); }
    finally { setSaving(false); }
  };
  // Stage moves route through the operational pipeline when there is an
  // application; the worker mirrors the result back into the record. Optimistic:
  // reflect the new stage immediately, then confirm with a light refresh of just
  // this record (no full People-list reload; the rail catches up on its next
  // natural refresh). On failure the optimistic stage reverts.
  const onMoveStage = async (to) => {
    // Approving and refunding carry side effects (role promotion + onboarding
    // email; Stripe refund + cancel), so route those through their dedicated
    // endpoints rather than a raw status write. Everything else is a plain PATCH.
    if (to === "refunded" && !confirm("Move to Refunded? This refunds the member in full and cancels their subscription.")) return;
    setOptimisticStage(to);
    try {
      if (!appId) {
        await client.setStage(id, to);
      } else if (to === "approved") {
        await api(`/api/admin/applications/${appId}/approve`, { method: "POST", body: "{}" });
        bus.dispatchEvent(new Event("people:reload"));
      } else if (to === "refunded") {
        await api(`/api/admin/applications/${appId}/refund`, { method: "POST", body: "{}" });
        bus.dispatchEvent(new Event("people:reload"));
      } else {
        await api(`/api/admin/applications/${appId}`, { method: "PATCH", body: JSON.stringify({ status: to }) });
      }
      state.refresh();
      reloadActs(); // the move logs a stage_change activity; refresh the Notes feed
    } catch (e) {
      setOptimisticStage(null);
      throw e;
    }
  };
  const onAddTag = async (t) => { await client.addTag(id, t); state.refresh(); };
  const onRemoveTag = async (t) => { await client.removeTag(id, t); state.refresh(); };
  const onLinkIdentity = async () => { await client.linkIdentity(id); state.refresh(); };
  const onAddNote = async (b) => { await client.addActivity(id, { kind: "note", body: b }); reloadActs(); };
  const onAddTask = async (t) => { await client.addActivity(id, { kind: "task", body: t.body, dueAt: t.dueAt, waitingOn: t.waitingOn }); reloadActs(); };
  const onToggleTask = async (a, done) => { await client.updateTask(a.id, { status: done ? "done" : "open" }); reloadActs(); };

  // The Access (role) tab is super-admin-only.
  const canAccess = superAdmin && record.clerkUserId;
  const tabs = canAccess ? [...REC_TABS, ["access", "Access"]] : REC_TABS;

  return (
    <div class="card crm-drawer">
      <div class="crm-drawer-head">
        <div class="crm-drawer-title">{record.name || record.primaryEmail}</div>
        <button class="signout-btn" onClick={onClose}>Close</button>
      </div>

      <div class="rec-tabs">
        {tabs.map(([key, label]) => (
          <button type="button" class={"rec-tab" + (subtab === key ? " on" : "")} onClick={() => setSubtab(key)}>{label}</button>
        ))}
      </div>

      <div class="rec-panel">
        {subtab === "info" && (
          <div class="rec-info">
            <FieldsForm crm={crm} type="person" record={record} onSubmit={onSaveFields} submitting={saving} submitLabel="Save profile" />
            <div class="rec-section"><div class="card-label">Tags</div><TagEditor tags={state.detail.tags} onAdd={onAddTag} onRemove={onRemoveTag} /></div>
            <IdentityCard record={record} onLink={onLinkIdentity} />
          </div>
        )}
        {subtab === "stage" && <StageControl crm={crm} record={stageRecord} onMove={onMoveStage} />}
        {subtab === "comms" && <EmailComposer record={record} />}
        {subtab === "history" && <CommsHistory recordId={id} />}
        {subtab === "scheduling" && <Scheduling appId={appId} onChanged={afterChange} />}
        {subtab === "billing" && (
          <div class="rec-info">
            <BillingCard record={record} />
            <LifecycleActions record={record} onChanged={afterChange} />
          </div>
        )}
        {subtab === "notes" && (
          <ActivityFeed activities={acts} onAddNote={onAddNote} onAddTask={onAddTask} onToggleTask={onToggleTask} />
        )}
        {subtab === "access" && canAccess && (
          <AccessCard
            clerkUserId={record.clerkUserId}
            myUserId={myUserId}
            currentRole={roleMap && roleMap.get((record.primaryEmail || "").toLowerCase())}
          />
        )}
      </div>
    </div>
  );
}

export function PeopleTab({ myUserId, superAdmin }) {
  const query = useCrmQuery(client, "person");
  const [openId, setOpenId] = useState(null);
  const [summary, setSummary] = useState(null);
  // email(lowercased) -> Clerk role, from /api/admin/people, so the rail can
  // highlight admins/members. Refreshed whenever roles may have changed.
  const [roleMap, setRoleMap] = useState(() => new Map());

  const loadSummary = useCallback(() => {
    client.summary("person").then(setSummary).catch(() => {});
  }, []);
  const loadRoles = useCallback(() => {
    api("/api/admin/people").then((res) => {
      const m = new Map();
      for (const p of res.people || []) if (p.role) m.set((p.email || "").toLowerCase(), p.role);
      setRoleMap(m);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadSummary();
    loadRoles();
    const onReload = () => { query.refresh(); loadSummary(); loadRoles(); };
    bus.addEventListener("people:reload", onReload);
    return () => bus.removeEventListener("people:reload", onReload);
  }, [loadSummary, loadRoles]);

  // Escape deselects the focused person (detail pane returns to the summary).
  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => { if (e.key === "Escape") setOpenId(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  const onChanged = useCallback(() => { query.refresh(); loadSummary(); loadRoles(); }, [query, loadSummary, loadRoles]);

  const stages = summary?.stages || {};
  // Full-width, two-pane master/detail: a left exploration rail (search +
  // stage filters + the people list) and a docked detail pane on the right.
  return (
    <div class="people-full">
      <div class="card people-stats">
        <div class="stats-row">
          <div class="stat"><div class="stat-num">{summary ? summary.total : "–"}</div><div class="stat-label">People</div></div>
          <div class="stat"><div class="stat-num">{summary ? (stages.submitted || 0) : "–"}</div><div class="stat-label">Submitted</div></div>
          <div class="stat"><div class="stat-num">{summary ? (stages.paid_pending_vetting || 0) : "–"}</div><div class="stat-label">Paid</div></div>
          <div class="stat"><div class="stat-num">{summary ? (stages.call_scheduled || 0) : "–"}</div><div class="stat-label">Call set</div></div>
          <div class="stat"><div class="stat-num">{summary ? (stages.approved || 0) : "–"}</div><div class="stat-label">Approved</div></div>
          <div class="stat"><div class="stat-num">{summary ? summary.openTasks : "–"}</div><div class="stat-label">Open tasks</div></div>
        </div>
      </div>

      <div class="people-grid">
        {/* Left: exploration / discovery rail. */}
        <div class="card people-rail">
          <div class="card-label">People</div>
          <PeopleRail query={query} roleMap={roleMap} openId={openId} onOpen={setOpenId} />
        </div>

        {/* Right: the focused person's detail, or a hint when nothing is chosen. */}
        <div class="people-detail">
          {openId ? (
            <RecordDrawer id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} superAdmin={superAdmin} myUserId={myUserId} roleMap={roleMap} />
          ) : (
            <div class="card people-empty">
              <div class="card-label">Details</div>
              <p>Select a person on the left to see their profile, billing, intro call, tags, notes, and to send them email.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
