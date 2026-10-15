// The Add person form above the People list (Tori, 2026-10-15). Creates one
// person through POST /api/admin/people/add (src/add-person.mjs), which finds
// anyone who already has either email before creating a second record. After
// a save the list refreshes and the new person's Action tab opens, where their
// Action is set.

import { useState } from "preact/hooks";

const PATH = "/api/admin/people/add";

const EMPTY = {
  name: "", email: "", secondaryEmail: "", firstName: "", lastName: "", preferredName: "",
  phone: "", organization: "", title: "", linkedin: "", group: "", optedIn: false,
};

// The site's own fetch with the Clerk session token, keeping the server's
// error message and the record id a 409 carries.
async function post(path, body) {
  const headers = { "content-type": "application/json" };
  try {
    const token = await window.Clerk?.session?.getToken();
    if (token) headers.authorization = "Bearer " + token;
  } catch { /* answered as 401 below */ }
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || `Request failed (${res.status})`), { recordId: out.recordId ?? null });
  return out;
}

const FIELDS = [
  ["name", "Full name", "text", true],
  ["email", "Email", "email", true],
  ["secondaryEmail", "Second email", "email"],
  ["firstName", "First name", "text"],
  ["lastName", "Last name", "text"],
  ["preferredName", "Preferred name", "text"],
  ["phone", "Phone", "tel"],
  ["organization", "Organization", "text"],
  ["title", "Title", "text"],
  ["linkedin", "LinkedIn", "text"],
];

/**
 * onAdded(recordId) after a save; onOpen(recordId) for the person who already
 * has the address.
 */
export function AddPerson({ onAdded, onOpen, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.type === "checkbox" ? e.currentTarget.checked : e.currentTarget.value });
  const close = () => { setOpen(false); setForm(EMPTY); setError(null); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const out = await post(PATH, form);
      setAdded(out.name);
      close();
      onAdded?.(out.recordId);
    } catch (err) {
      setError({ message: err.message, recordId: err.recordId });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div class="ap-bar">
        <style>{CSS}</style>
        <button type="button" class="ap-btn" onClick={() => { setOpen(true); setAdded(null); }}>Add person</button>
        {added ? <span class="ap-note" role="status">{added} is added. Set their Action on the Action tab.</span> : null}
      </div>
    );
  }

  return (
    <form class="ap-card" aria-label="Add person" onSubmit={submit}>
      <style>{CSS}</style>
      <div class="ap-title">Add person</div>
      <div class="ap-grid">
        {FIELDS.map(([k, label, type, required]) => (
          <label class="ap-field" key={k}>
            <span>{label}{required ? " *" : ""}</span>
            <input type={type} name={k} value={form[k]} required={required} onInput={set(k)} />
          </label>
        ))}
        <label class="ap-field">
          <span>Group</span>
          <select name="group" value={form.group} onChange={set("group")}>
            <option value="">Community</option>
            <option value="partner">Partner</option>
            <option value="team">Team</option>
          </select>
        </label>
      </div>
      <label class="ap-check">
        <input type="checkbox" name="optedIn" checked={form.optedIn} onChange={set("optedIn")} />
        <span>They have agreed to receive our updates</span>
      </label>
      {error ? (
        <p class="ap-error" role="alert">
          {error.message}{" "}
          {error.recordId ? <button type="button" class="ap-link" onClick={() => { const id = error.recordId; close(); onOpen?.(id); }}>Open their record</button> : null}
        </p>
      ) : null}
      <div class="ap-actions">
        <button type="submit" class="ap-btn" disabled={saving}>{saving ? "Adding…" : "Add person"}</button>
        <button type="button" class="ap-btn secondary" onClick={close} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

const CSS = `
.ap-bar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 14px}
.ap-note{font-size:13px;color:var(--sage)}
.ap-card{display:grid;gap:14px;margin:0 0 18px;padding:18px 20px;border-radius:12px;background:var(--ui-surface,#fff);border:1px solid var(--ui-border,rgba(47,62,52,.14))}
.ap-title{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--moss)}
.ap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.ap-field{display:grid;gap:4px;font-size:12px;color:var(--sage)}
.ap-field input,.ap-field select{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font:inherit;font-size:14px;color:var(--moss);background:#fff;box-sizing:border-box}
.ap-field input:focus,.ap-field select:focus{outline:none;border-color:var(--lime);box-shadow:var(--ui-focus)}
.ap-check{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--moss)}
.ap-error{margin:0;font-size:14px;color:#a3412a}
.ap-actions{display:flex;gap:10px}
.ap-btn{border:0;border-radius:100px;background:var(--lime);color:#fff;font:inherit;font-size:13px;font-weight:700;padding:9px 20px;cursor:pointer}
.ap-btn:hover{background:var(--lime-dark)}
.ap-btn:disabled{opacity:.5;cursor:default}
.ap-btn.secondary{background:transparent;color:var(--moss);border:1px solid var(--border)}
.ap-link{border:0;background:none;padding:0;font:inherit;color:var(--moss);text-decoration:underline;cursor:pointer}
`;
