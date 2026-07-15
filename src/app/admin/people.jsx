// People tab: one row per person (applications joined with accounts and
// Clerk roles by the worker), with inline role/status/meeting edits, the
// deliberate Approve action, and the Refund non-fit action.
import { useState, useEffect, useCallback } from "preact/hooks";
import { api, bus, ROLES, STATUS_LABELS, APPROVABLE, toLocalInputValue } from "../lib.js";

export function PersonRow({ p, myUserId, reload }) {
  const app = p.application;
  const [role, setRole] = useState(p.role);
  const [status, setStatus] = useState(app?.status);
  const [meeting, setMeeting] = useState(app?.meetingAt ? toLocalInputValue(app.meetingAt) : "");
  const [saveLabel, setSaveLabel] = useState("Save");
  const [saving, setSaving] = useState(false);
  const [approveLabel, setApproveLabel] = useState("Approve");
  const [approving, setApproving] = useState(false);
  const [refundLabel, setRefundLabel] = useState("Refund");
  const [refunding, setRefunding] = useState(false);

  const isSelf = p.userId === myUserId;
  const canSave = (p.userId && !isSelf) || app;

  const approve = async () => {
    setApproving(true);
    setApproveLabel("Approving…");
    try {
      await api(`/api/admin/applications/${app.id}/approve`, { method: "POST", body: "{}" });
      await reload();
    } catch (e) {
      console.error(e);
      setApproveLabel("Retry");
      setApproving(false);
    }
  };

  const refund = async () => {
    const sure = confirm(
      "Refund " + (p.name || p.email) + " in full and cancel their subscription? " +
      "Their membership will not renew. This is the non-fit action.");
    if (!sure) return;
    setRefunding(true);
    setRefundLabel("Refunding…");
    try {
      await api(`/api/admin/applications/${app.id}/refund`, { method: "POST", body: "{}" });
      await reload();
    } catch (e) {
      console.error(e);
      setRefundLabel("Retry");
      setRefunding(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveLabel("Saving…");
    try {
      const work = [];
      if (p.userId && !isSelf && role !== p.role) {
        work.push(api("/api/admin/people/role", {
          method: "POST",
          body: JSON.stringify({ userId: p.userId, role }),
        }).then(() => { p.role = role; }));
      }
      if (app) {
        const payload = { status };
        if (meeting) {
          const ms = new Date(meeting).getTime();
          if (Number.isFinite(ms)) payload.meetingAt = ms;
        }
        work.push(api(`/api/admin/applications/${app.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }));
      }
      await Promise.all(work);
      setSaveLabel("Saved");
      setTimeout(() => { setSaveLabel("Save"); setSaving(false); }, 1500);
    } catch (e) {
      console.error(e);
      setSaveLabel("Retry");
      setSaving(false);
    }
  };

  return (
    <tr>
      <td class="person">{p.name || "(no name)"}</td>
      <td>{p.email}</td>
      <td>
        {p.userId ? (
          <select
            value={role}
            disabled={isSelf}
            title={isSelf ? "You cannot change your own role." : undefined}
            onChange={(e) => setRole(e.currentTarget.value)}
          >
            {ROLES.map((r) => (
              <option value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        ) : (
          <span class="muted">No account</span>
        )}
      </td>
      <td>
        {app ? (
          <select value={status} onChange={(e) => setStatus(e.currentTarget.value)}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option value={value}>{label}</option>
            ))}
          </select>
        ) : (
          <span class="muted">No application</span>
        )}
      </td>
      <td>
        {app && (
          <>
            {app.status === "refunded" ? (
              <span class="pay-badge refunded">Refunded</span>
            ) : app.paid ? (
              <span class="pay-badge paid">Paid</span>
            ) : (
              <span class="pay-badge unpaid">Unpaid</span>
            )}
            {app.renewalAt && app.paid && app.status !== "refunded" ? (
              <span class="pay-renewal">renews {new Date(app.renewalAt).toLocaleDateString()}</span>
            ) : null}
          </>
        )}
      </td>
      <td>
        {app && (
          <>
            <input
              type="datetime-local"
              value={meeting}
              onInput={(e) => setMeeting(e.currentTarget.value)}
            />
            {app.meetingLink && (
              <a
                href={app.meetingLink}
                target="_blank"
                rel="noopener"
                title="View or change in Google Calendar (the mirror is read-only)"
                style="margin-left:8px;font-size:12px;color:var(--lime-dark);font-weight:700;text-decoration:none;"
              >
                open
              </a>
            )}
          </>
        )}
      </td>
      <td class="row-actions-td">
        <div class="row-actions">
          {app && APPROVABLE.includes(app.status) && (
            <button class="row-save row-approve" disabled={approving} onClick={approve}>{approveLabel}</button>
          )}
          {app && app.paid && !["approved", "refunded"].includes(app.status) && (
            <button class="row-save row-refund" disabled={refunding} onClick={refund}>{refundLabel}</button>
          )}
          {canSave && (
            <button class="row-save" disabled={saving} onClick={save}>{saveLabel}</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function PeopleTab({ myUserId }) {
  const [people, setPeople] = useState(null); // null = loading
  // Bumped per reload so rows remount with fresh edit state, matching the
  // old full-rebuild behavior.
  const [gen, setGen] = useState(0);

  const reload = useCallback(async () => {
    const res = await api("/api/admin/people");
    setPeople(res.people);
    setGen((g) => g + 1);
  }, []);

  useEffect(() => {
    reload().catch(console.error);
    const onReload = () => reload().catch(console.error);
    bus.addEventListener("people:reload", onReload);
    return () => bus.removeEventListener("people:reload", onReload);
  }, [reload]);

  return (
    <>
      <div class="card">
        <div class="card-label">Internal Stats</div>
        <div class="stats-row">
          <div class="stat"><div class="stat-num">{people ? people.length : "–"}</div><div class="stat-label">People</div></div>
          <div class="stat"><div class="stat-num">{people ? people.filter((p) => p.application).length : "–"}</div><div class="stat-label">Applications</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-label">People</div>
        <div class="table-wrap">
          <table id="people-table">
            <thead>
              <tr><th>Person</th><th>Email</th><th>Role</th><th>Status</th><th>Payment</th><th>Introduction call</th><th></th></tr>
            </thead>
            <tbody>
              {people === null && (
                <tr><td colSpan={7}><div class="loading-note"><span class="spinner"></span> Loading people…</div></td></tr>
              )}
              {people?.map((p) => (
                <PersonRow key={gen + ":" + p.email} p={p} myUserId={myUserId} reload={reload} />
              ))}
            </tbody>
          </table>
        </div>
        {people && !people.length && (
          <p class="empty-note">People appear here as applications and accounts arrive.</p>
        )}
      </div>
    </>
  );
}
