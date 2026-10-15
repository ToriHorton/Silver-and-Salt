// The Partners & Team workspace (Tori, 2026-10-14). The people we keep a
// relationship with who are not on a signup journey: Partners and Team. Each
// tab lists who is in the group, where they work, whether they can receive our
// updates, their last call, open follow-ups and the latest note. Names open the
// person's own record, where the notes, calls and tags live.
//
// Membership of a group is the "partner" or "team" tag on the person
// (src/relationship-groups.mjs). This page only reads.

import { useEffect, useState } from "preact/hooks";
import { Tabs } from "@odla-ai/ui/components";

const PATH = "/api/admin/relationships";

const GROUPS = [
  {
    id: "partner",
    label: "Partners",
    blurb: "Organizations we work alongside. They hear our updates, and they are never on a signup journey.",
    empty: "No one is tagged partner yet.",
  },
  {
    id: "team",
    label: "Team",
    blurb: "The people who run Silver & Salt Capital with us. They hear our updates, and they are never on a signup journey.",
    empty: "No one is tagged team yet.",
  },
];

// What emailStatus means for our updates, which need the person's consent.
const UPDATES = {
  ok: "Yes",
  none: "Not asked",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  suppressed: "Blocked",
};

async function request(path) {
  const headers = {};
  try {
    const token = await window.Clerk?.session?.getToken();
    if (token) headers.authorization = "Bearer " + token;
  } catch { /* answered as 401 below */ }
  const res = await fetch(path, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const day = (ms) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

// ChapterAdmin's `workspaces` transform: add this workspace after People.
export function withRelationships() {
  return (defaults) => {
    const workspace = { id: "relationships", label: "Partners & Team", defaultViewId: "partner", render: (ctx) => <RelationshipsWorkspace ctx={ctx} /> };
    const at = defaults.findIndex((w) => w.id === "people");
    return at === -1 ? [...defaults, workspace] : [...defaults.slice(0, at + 1), workspace, ...defaults.slice(at + 1)];
  };
}

function RelationshipsWorkspace({ ctx }) {
  const active = GROUPS.some((g) => g.id === ctx.route.viewId) ? ctx.route.viewId : "partner";
  return (
    <Tabs
      ariaLabel="Partners and team"
      value={active}
      mount="active"
      items={GROUPS.map((g) => ({
        value: g.id,
        label: g.label,
        href: ctx.href({ viewId: g.id, recordId: null, detailTab: null }),
        panel: <GroupList group={g} ctx={ctx} />,
      }))}
    />
  );
}

function GroupList({ group, ctx }) {
  const [state, setState] = useState({ loading: true, people: [], error: null });
  useEffect(() => {
    request(`${PATH}?group=${group.id}`)
      .then((data) => setState({ loading: false, people: data.people, error: null }))
      .catch((error) => setState({ loading: false, people: [], error }));
  }, [group.id]);
  return <GroupView group={group} ctx={ctx} {...state} />;
}

// The list itself, given the people. Exported for tests/relationships.test.jsx.
export function GroupView({ group, ctx, loading, people, error }) {
  const personHref = (id) => ctx.href({ workspaceId: "people", viewId: "person", recordId: id, detailTab: "activity" });
  return (
    <div class="card">
      <p class="muted">{group.blurb} To add someone, open their record in People and add the tag <strong>{group.id}</strong>.</p>
      {loading && <p class="muted">Loading…</p>}
      {error && <p class="muted">This list could not be loaded. {error.message}</p>}
      {!loading && !error && !people.length && <p class="muted">{group.empty}</p>}
      {!loading && !error && people.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style="text-align:left">Name</th>
              <th style="text-align:left">Organization</th>
              <th style="text-align:left">Email</th>
              <th style="text-align:left">Updates</th>
              <th style="text-align:left">Last call</th>
              <th style="text-align:left">Follow-ups</th>
              <th style="text-align:left">Latest note</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <th style="text-align:left"><a href={personHref(p.id)}>{p.name}</a></th>
                <td>{p.organization}{p.title ? <div class="muted">{p.title}</div> : null}</td>
                <td>{p.email}{p.secondaryEmail ? <div class="muted">{p.secondaryEmail}</div> : null}</td>
                <td>{UPDATES[p.emailStatus] ?? "Not asked"}</td>
                <td>{day(p.lastCallAt)}</td>
                <td>{p.openTasks || ""}</td>
                <td>{p.latestNote ? <><span class="muted">{day(p.latestNote.at)}</span> {p.latestNote.body}</> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
