// Add a person by hand from the admin People workspace (Tori, 2026-10-15).
// Until now a person only reached the CRM by applying, by the contact-list
// upload (_scripts/upload-contacts.mjs) or by call ingest. This is the same
// create the upload does, one person at a time:
//
//   POST /api/admin/people/add   admins only
//
// Rules, matching the upload:
//   - A person is found by either email, live or archived, before anyone is
//     created. A match is answered 409 with the record's id, so the form can
//     open them instead of making a second record.
//   - New people start at the "prospect" stage with no Action; Tori sets one
//     on the Action tab, where the same rules as the labels job apply.
//   - Group Partner or Team is the "partner" or "team" tag
//     (src/relationship-groups.mjs).
//   - Updates need consent. Ticked, the address is subscribed. Unticked, a
//     Community person starts unsubscribed (like the upload and call ingest)
//     and a Partner or Team person is left unasked.

import { addTag, createRecord, listRecords } from "@odla-ai/crm";
import { crm } from "./crm.mjs";
import { GROUPS } from "./relationship-groups.mjs";

export const ADD_PERSON_PATH = "/api/admin/people/add";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (v) => (typeof v === "string" ? v.trim() : "");
const lower = (v) => clean(v).toLowerCase();
const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// The optional fields the form sends, copied onto the record when filled.
export const OPTIONAL_FIELDS = ["firstName", "lastName", "preferredName", "phone", "organization", "title", "linkedin"];

/**
 * The form body as what to create, or { error } with the reason in Tori's
 * words. Pure, so the rules are tested without a database.
 */
export function planPerson(body) {
  const name = clean(body?.name);
  const email = lower(body?.email);
  const secondaryEmail = lower(body?.secondaryEmail);
  const group = clean(body?.group) || null;
  if (!name) return { error: "Add their name." };
  if (!isEmail(email)) return { error: "Add a valid email address." };
  if (secondaryEmail && !isEmail(secondaryEmail)) return { error: "The second email is not a valid address." };
  if (secondaryEmail === email) return { error: "The second email is the same as the first." };
  if (group && !GROUPS.includes(group)) return { error: "Group must be Community, Partner or Team." };
  const input = { name, email };
  if (secondaryEmail) input.secondaryEmail = secondaryEmail;
  for (const k of OPTIONAL_FIELDS) {
    const v = clean(body?.[k]);
    if (v) input[k] = v;
  }
  const optedIn = body?.optedIn === true;
  const emailConsent = optedIn
    ? { state: "subscribed", source: "admin-add-person" }
    : group ? null : { state: "unsubscribed", source: "admin-add-person" };
  return { input, group, emailConsent };
}

/** Everyone, live and archived (a plain listRecords reads only one side). */
async function loadEveryone(deps) {
  const out = [];
  for (const archived of [false, true]) {
    const part = [];
    for (let offset = 0; offset < 5000; offset += 200) {
      const { records, total } = await listRecords(deps, { type: "person", limit: 200, offset, archived });
      part.push(...records.map((r) => ({ ...r, archived })));
      if (part.length >= total || !records.length) break;
    }
    out.push(...part);
  }
  return out;
}

/** The existing person either address belongs to, live before archived. */
export function findExisting(people, emails) {
  const wanted = new Set(emails.filter(Boolean));
  const owns = (p) => [lower(p.primaryEmail ?? p.fields?.email), lower(p.fields?.secondaryEmail)].some((e) => e && wanted.has(e));
  return people.find((p) => !p.archived && owns(p)) ?? people.find((p) => p.archived && owns(p)) ?? null;
}

/** Create the person, or answer who already has the address. */
export async function addPerson(deps, body) {
  const plan = planPerson(body);
  if (plan.error) return { status: 400, body: { error: plan.error } };
  const existing = findExisting(await loadEveryone(deps), [plan.input.email, plan.input.secondaryEmail]);
  if (existing) {
    return {
      status: 409,
      body: {
        error: existing.archived
          ? `${existing.name} is already in People, archived. Open their record to restore them.`
          : `${existing.name} is already in People.`,
        recordId: existing.id,
        archived: existing.archived,
      },
    };
  }
  const created = await createRecord(deps, {
    type: "person",
    input: plan.input,
    stage: "prospect",
    mutationId: `admin-add-person:${plan.input.email}`,
    ...(plan.emailConsent ? { emailConsent: plan.emailConsent } : {}),
  });
  if (plan.group) await addTag(deps, { recordId: created.id, tag: plan.group, mutationId: `admin-add-person:tag:${created.id}:${plan.group}` });
  return { status: 200, body: { recordId: created.id, name: plan.input.name } };
}

export const addPersonRoute = async (req, url, env, ctx) => {
  if (url.pathname !== ADD_PERSON_PATH || req.method !== "POST") return null;
  const user = await ctx.verifyUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = ctx.makeDb(env);
  if (!(await ctx.isAdmin(db, user))) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => null);
  const { status, body: out } = await addPerson({ crm, db }, body);
  return json(out, status);
};
