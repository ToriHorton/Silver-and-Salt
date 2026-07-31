// People tab: one row per person (applications joined with accounts and
// Clerk roles by the worker) on the @odla-ai/ui DataTable, with inline
// role/status/meeting edits, the deliberate Approve action, and the Refund
// non-fit action.
//
// Edit-state model: each row carries a mutable `draft` (role, status,
// meeting) written by UNCONTROLLED selects/inputs; the actions cell reads
// the draft at save time. DataTable keys rows by rowKey, so sorting and
// filtering move the live <tr> nodes and in-flight edits survive reorder.
// After any mutation the tab reloads and bumps a generation counter that is
// part of the rowKey, remounting rows onto fresh server state.
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { DataTable } from "@odla-ai/ui/components";
import { api, bus, ROLES, STATUS_LABELS, APPROVABLE, toLocalInputValue } from "../lib.js";

function RowActions({ p, draft, reload }) {
  const app = p.application;
  const [saveLabel, setSaveLabel] = useState("Save");
  const [saving, setSaving] = useState(false);
  const [approveLabel, setApproveLabel] = useState("Approve");
  const [approving, setApproving] = useState(false);
  const [refundLabel, setRefundLabel] = useState("Refund");
  const [refunding, setRefunding] = useState(false);

  const isSelf = p.userId === draft.myUserId;
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
      if (p.userId && !isSelf && draft.role !== p.role) {
        work.push(api("/api/admin/people/role", {
          method: "POST",
          body: JSON.stringify({ userId: p.userId, role: draft.role }),
        }).then(() => { p.role = draft.role; }));
      }
      if (app) {
        const payload = { status: draft.status };
        if (draft.meeting) {
          const ms = new Date(draft.meeting).getTime();
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
  );
}

// Exported for the render tests (fixture rows through the real columns).
export const peopleColumns = (myUserId, reload) => [
  {
    key: "person",
    header: "Person",
    sortAs: "string",
    sortValue: (r) => r.name || "",
    filterText: (r) => r.name || "",
    cell: (r) => <span class="cell-person">{r.name || "(no name)"}</span>,
  },
  {
    key: "email",
    header: "Email",
    sortAs: "string",
    sortValue: (r) => r.email,
    filterText: (r) => r.email,
    cell: (r) => r.email,
  },
  {
    key: "role",
    header: "Role",
    sortAs: "string",
    sortValue: (r) => r.role ?? "",
    cell: (r) =>
      r.userId ? (
        <select
          defaultValue={r.draft.role}
          disabled={r.userId === myUserId}
          title={r.userId === myUserId ? "You cannot change your own role." : undefined}
          onChange={(e) => { r.draft.role = e.currentTarget.value; }}
        >
          {ROLES.map((role) => (
            <option value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
          ))}
        </select>
      ) : (
        <span class="muted">No account</span>
      ),
  },
  {
    key: "status",
    header: "Status",
    sortAs: "string",
    sortValue: (r) => r.application?.status ?? "",
    cell: (r) =>
      r.application ? (
        <select
          defaultValue={r.draft.status}
          onChange={(e) => { r.draft.status = e.currentTarget.value; }}
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option value={value}>{label}</option>
          ))}
        </select>
      ) : (
        <span class="muted">No application</span>
      ),
  },
  {
    key: "payment",
    header: "Payment",
    sortAs: "string",
    sortValue: (r) => {
      const app = r.application;
      if (!app) return "";
      return app.status === "refunded" ? "refunded" : app.paid ? "paid" : "unpaid";
    },
    cell: (r) => {
      const app = r.application;
      if (!app) return null;
      return (
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
      );
    },
  },
  {
    key: "meeting",
    header: "Introduction call",
    sortAs: "date",
    sortValue: (r) => r.application?.meetingAt ?? 0,
    cell: (r) =>
      r.application ? (
        <>
          <input
            type="datetime-local"
            defaultValue={r.draft.meeting}
            onInput={(e) => { r.draft.meeting = e.currentTarget.value; }}
          />
          {r.application.meetingLink && (
            <a
              href={r.application.meetingLink}
              target="_blank"
              rel="noopener"
              title="View or change in Google Calendar (the mirror is read-only)"
              style="margin-left:8px;font-size:12px;color:var(--lime-dark);font-weight:700;text-decoration:none;"
            >
              open
            </a>
          )}
        </>
      ) : null,
  },
  {
    key: "actions",
    header: "",
    cell: (r) => <RowActions p={r} draft={r.draft} reload={reload} />,
  },
];

export function PeopleTab({ myUserId }) {
  const [people, setPeople] = useState(null); // null = loading
  // Bumped per reload so rows remount onto fresh server state; constant
  // between reloads so sort/filter reorder preserves in-flight edits.
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

  // Each row carries its edit draft; rebuilt per reload (fresh `gen`).
  const rows = useMemo(
    () =>
      (people ?? []).map((p) => ({
        ...p,
        draft: {
          myUserId,
          role: p.role ?? "provisional",
          status: p.application?.status ?? "",
          meeting: p.application?.meetingAt ? toLocalInputValue(p.application.meetingAt) : "",
        },
      })),
    [people, gen, myUserId],
  );
  const cols = useMemo(() => peopleColumns(myUserId, reload), [myUserId, reload]);

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
        <DataTable
          rows={rows}
          columns={cols}
          rowKey={(r) => gen + ":" + r.email}
          filterable
          filterPlaceholder="Filter by name or email…"
          loading={people === null}
          loadingState={<div class="loading-note"><span class="spinner"></span> Loading people…</div>}
          emptyState={<p class="empty-note">People appear here as applications and accounts arrive.</p>}
          ariaLabel="People"
        />
      </div>
    </>
  );
}
