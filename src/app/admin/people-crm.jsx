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
  CrmList,
  RecordPanel,
  ActivityFeed,
  ViewEditor,
  BulkBar,
  useCrmQuery,
  useCrmRecord,
} from "@odla-ai/crm/ui";
import { crm } from "../../crm.mjs";
import { api, bus, ROLES, STATUS_LABELS, APPROVABLE } from "../lib.js";

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
function AccessCard({ clerkUserId, myUserId }) {
  const [access, setAccess] = useState(null);
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const isSelf = clerkUserId === myUserId;

  const load = useCallback(() => {
    setMsg(null);
    api(`/api/admin/people/access?userId=${encodeURIComponent(clerkUserId)}`)
      .then((a) => { setAccess(a); setRole(a.role); })
      .catch((e) => setMsg("Could not load access: " + (e.message || e)));
  }, [clerkUserId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api("/api/admin/people/role", { method: "POST", body: JSON.stringify({ userId: clerkUserId, role }) });
      setMsg("Saved ✓");
      load();
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
      {!access ? (
        <p class="muted">Loading…</p>
      ) : (
        <>
          {access.superAdmin && (
            <p class="crm-consent-note">Super-admin (set in odla Studio). Managed there, not here.</p>
          )}
          <label class="crm-field">
            <span>Role</span>
            <select value={role} disabled={isSelf || access.superAdmin || saving}
              onChange={(e) => setRole(e.currentTarget.value)}>
              {ROLES.map((r) => <option value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </label>
          {isSelf && <p class="muted" style="font-size:12px;margin:-4px 0 10px">You cannot change your own role.</p>}
          <div class="crm-email-actions">
            <button class="row-save" disabled={saving || isSelf || access.superAdmin || role === access.role} onClick={save}>
              {saving ? "Saving…" : "Save role"}
            </button>
            {msg && <span class="crm-email-result">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ── One person's detail: lifecycle + email + the packaged RecordPanel ──
function RecordDrawer({ id, onClose, onChanged, superAdmin, myUserId }) {
  const state = useCrmRecord(client, id);
  const [saving, setSaving] = useState(false);
  const [acts, setActs] = useState([]);

  const reloadActs = useCallback(() => {
    client.listActivities(id).then((r) => setActs(r.activities || [])).catch(() => {});
  }, [id]);
  useEffect(() => { reloadActs(); }, [reloadActs]);

  if (state.error) return <div class="card"><p class="crm-error">Could not load this record: {state.error}</p><button class="row-save" onClick={onClose}>Close</button></div>;
  if (state.loading || !state.detail) return <div class="card"><span class="spinner"></span> Loading record…</div>;

  const { record } = state.detail;
  const appId = record.fields && record.fields.applicationId;

  const onSaveFields = async (input) => {
    setSaving(true);
    try { await client.updateRecord(id, { input }); state.refresh(); }
    finally { setSaving(false); }
  };
  // Stage moves route through the operational pipeline when there is an
  // application; the worker mirrors the result back into the record.
  const onMoveStage = async (to) => {
    if (appId) {
      await api(`/api/admin/applications/${appId}`, { method: "PATCH", body: JSON.stringify({ status: to }) });
      bus.dispatchEvent(new Event("people:reload"));
    } else {
      await client.setStage(id, to);
    }
    state.refresh();
    onChanged();
  };
  const onAddTag = async (t) => { await client.addTag(id, t); state.refresh(); };
  const onRemoveTag = async (t) => { await client.removeTag(id, t); state.refresh(); };
  const onLinkIdentity = async () => { await client.linkIdentity(id); state.refresh(); };
  const onAddNote = async (b) => { await client.addActivity(id, { kind: "note", body: b }); reloadActs(); };
  const onAddTask = async (t) => { await client.addActivity(id, { kind: "task", body: t.body, dueAt: t.dueAt, waitingOn: t.waitingOn }); reloadActs(); };
  const onToggleTask = async (a, done) => { await client.updateTask(a.id, { status: done ? "done" : "open" }); reloadActs(); };

  return (
    <div class="card crm-drawer">
      <div class="crm-drawer-head">
        <div class="crm-drawer-title">{record.name || record.primaryEmail}</div>
        <button class="signout-btn" onClick={onClose}>Close</button>
      </div>
      <LifecycleActions record={record} onChanged={async () => { state.refresh(); onChanged(); }} />
      <EmailComposer record={record} />
      {superAdmin && record.clerkUserId && (
        <AccessCard clerkUserId={record.clerkUserId} myUserId={myUserId} />
      )}
      <RecordPanel
        crm={crm}
        detail={state.detail}
        onSaveFields={onSaveFields}
        onMoveStage={onMoveStage}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        onLinkIdentity={onLinkIdentity}
        saving={saving}
        activitySlot={<ActivityFeed activities={acts} onAddNote={onAddNote} onAddTask={onAddTask} onToggleTask={onToggleTask} />}
      />
    </div>
  );
}

export function PeopleTab({ myUserId, superAdmin }) {
  const query = useCrmQuery(client, "person");
  const [openId, setOpenId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [summary, setSummary] = useState(null);

  const loadSummary = useCallback(() => {
    client.summary("person").then(setSummary).catch(() => {});
  }, []);
  useEffect(() => {
    loadSummary();
    const onReload = () => { query.refresh(); loadSummary(); };
    bus.addEventListener("people:reload", onReload);
    return () => bus.removeEventListener("people:reload", onReload);
  }, [loadSummary]);

  // Escape deselects the focused person (detail pane returns to the summary).
  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => { if (e.key === "Escape") setOpenId(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  const onChanged = useCallback(() => { query.refresh(); loadSummary(); }, [query, loadSummary]);

  const bulkEmail = async (ids) => {
    const subject = prompt(`Subject for a personal note to ${ids.length} people:`);
    if (!subject) return;
    const body = prompt("Message:");
    if (!body) return;
    let sent = 0, blocked = 0;
    for (const rid of ids) {
      try {
        const res = await client.sendEmail(rid, { templateId: "personal", vars: { firstName: "there", subject, body } });
        res.sent ? sent++ : blocked++;
      } catch { blocked++; }
    }
    bus.dispatchEvent(new Event("emaillog:reload"));
    alert(`Sent ${sent}, skipped ${blocked}.`);
    setSelected([]);
  };

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
          <div class="crm-list-wrap">
            <CrmList
              crm={crm}
              type="person"
              query={query}
              columns={["name", "stage", "primaryEmail"]}
              selectable
              selected={selected}
              onSelectionChange={setSelected}
              onOpenRecord={(r) => setOpenId(r.id)}
              toolbar={
                <div class="crm-toolbar">
                  <ViewEditor
                    current={{ type: "person", filters: query.params, sort: query.params.sort ?? null, columns: [] }}
                    onSave={(spec) => client.saveView(spec)}
                  />
                  <BulkBar
                    selected={selected}
                    onClear={() => setSelected([])}
                    actions={[{ id: "email", label: `Email ${selected.length}`, run: bulkEmail }]}
                  />
                </div>
              }
            />
          </div>
        </div>

        {/* Right: the focused person's detail, or a hint when nothing is chosen. */}
        <div class="people-detail">
          {openId ? (
            <RecordDrawer id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} superAdmin={superAdmin} myUserId={myUserId} />
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
