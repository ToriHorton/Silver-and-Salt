// The name an email greets someone by (Tori, 2026-10-14): their preferred
// name when they gave one, otherwise their first name. The join form asks for
// it as "Preferred Name (if different)", and the CRM keeps it as
// `preferredName`. Notices to Tori keep the legal name, so she can tell who
// someone is.

const text = (v) => (typeof v === "string" ? v.trim() : "");

/** Preferred name, else first name, from an application or a CRM person's fields. */
export function greetingName(person) {
  return text(person?.preferredName) || text(person?.firstName);
}
