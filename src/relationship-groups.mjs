// Partners and Team (Tori, 2026-10-14): people Silver & Salt Capital keeps a
// relationship with who are not on a signup journey. Partners are the
// organizations we work alongside (Invest for Better, Sorenson Impact, Second
// Growth Capital); Team is the people who run the community with us. Both stay
// in the CRM with their notes, calls and follow-ups, and both should hear our
// updates, but neither is ever given a Path or an Action.
//
// A person's group is a CRM tag ("partner" or "team"), set from the Tags box
// on their record. A tag rather than a new field because the CRM already
// stores, edits and filters tags, so this needs no schema change. Everyone
// without either tag is Community, the default.
//
// Where the group is honoured:
//   - src/labels-job.mjs never labels a tagged person, even if they apply
//   - src/labels-route.mjs leaves them off the Journeys dashboard and refuses
//     an Action for them
//   - the Partners & Team workspace (src/app/admin/relationships.jsx) lists
//     them, through GET /api/admin/relationships below

import { listActivities, listRecords } from "@odla-ai/crm";
import { crm } from "./crm.mjs";

export const GROUPS = ["partner", "team"];
export const GROUP_LABELS = { partner: "Partner", team: "Team" };
export const RELATIONSHIPS_PATH = "/api/admin/relationships";

const str = (v) => (typeof v === "string" ? v : "");

/** Every live person tagged with one group. */
async function taggedPeople(deps, tag) {
  const out = [];
  for (let offset = 0; offset < 5000; offset += 200) {
    const { records, total } = await listRecords(deps, { type: "person", tag, limit: 200, offset, archived: false });
    out.push(...records);
    if (out.length >= total || !records.length) break;
  }
  return out;
}

/**
 * recordId -> "partner" | "team" for everyone in a group. A person tagged
 * both reads as Partner, the first in GROUPS.
 */
export async function groupMembers(deps) {
  const byId = new Map();
  for (const tag of GROUPS) {
    for (const r of await taggedPeople(deps, tag)) if (!byId.has(r.id)) byId.set(r.id, tag);
  }
  return byId;
}

/** One person as the Partners & Team workspace shows them. */
async function relationshipRow(deps, record) {
  const f = record.fields ?? {};
  const activities = await listActivities(deps, { recordId: record.id, limit: 100 });
  const note = activities
    .filter((a) => a.kind === "note")
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
  const openTasks = activities.filter((a) => a.kind === "task" && a.status !== "done").length;
  return {
    id: record.id,
    name: record.name,
    email: str(record.primaryEmail) || str(f.email) || null,
    secondaryEmail: str(f.secondaryEmail) || null,
    organization: str(f.organization) || null,
    title: str(f.title) || null,
    emailStatus: str(record.emailStatus) || null,
    lastCallAt: typeof f.lastCallAt === "number" ? f.lastCallAt : null,
    openTasks,
    latestNote: note ? { body: str(note.body).slice(0, 280), at: note.createdAt ?? null } : null,
  };
}

/** Everyone in one group, sorted by name. */
export async function loadRelationships(deps, group) {
  const records = await taggedPeople(deps, group);
  const rows = [];
  for (const r of records) rows.push(await relationshipRow(deps, r));
  return rows.sort((a, b) => str(a.name).localeCompare(str(b.name)));
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** GET /api/admin/relationships?group=partner|team, admins only. */
export const relationshipsRoute = async (req, url, env, ctx) => {
  if (url.pathname !== RELATIONSHIPS_PATH || req.method !== "GET") return null;
  const user = await ctx.verifyUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = ctx.makeDb(env);
  if (!(await ctx.isAdmin(db, user))) return json({ error: "forbidden" }, 403);
  const group = url.searchParams.get("group") ?? "";
  if (!GROUPS.includes(group)) return json({ error: "group must be partner or team" }, 400);
  return json({ group, people: await loadRelationships({ crm, db }, group) });
};
