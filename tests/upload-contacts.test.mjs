import { describe, expect, it } from "vitest";
import { parseCsv, planRow } from "../_scripts/upload-contacts.mjs";

const row = (over = {}) => ({ name: "Jane Doe", first: "Jane", last: "Doe", org: "Acme", title: "CEO", email: "Jane@Example.com ", email2: "", action: "Introduction held", waive: "No", group: "Community", ...over });

describe("parseCsv", () => {
  it("reads quoted commas, doubled quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n,,\r\nx,y,z')).toEqual([["a", "b, c", 'say "hi"'], ["", "", ""], ["x", "y", "z"]]);
  });
});

describe("planRow", () => {
  it("makes Waive call Yes mean Invited, whatever the Action says", () => {
    expect(planRow(row({ action: "Identified", waive: "Yes" }))).toMatchObject({ action: "invited", waive: true, email: "jane@example.com", group: null });
  });

  it("keeps the sheet's Action when the call is not waived", () => {
    expect(planRow(row({ action: "Soft commit" })).action).toBe("soft_commit");
  });

  it("gives a Partner or Team member a group and no Action, but keeps their waiver", () => {
    expect(planRow(row({ group: "Partner", waive: "Yes" }))).toMatchObject({ group: "partner", action: null, waive: true });
    expect(planRow(row({ group: "Team" }))).toMatchObject({ group: "team", action: null });
  });

  it("skips Do not upload, missing emails and unknown values, and ignores blank rows", () => {
    expect(planRow(row({ action: "Do not upload" })).skip).toMatch(/Do not upload/);
    expect(planRow(row({ email: "" })).skip).toBe("no valid email");
    expect(planRow(row({ action: "Maybe" })).skip).toMatch(/unknown Action/);
    expect(planRow(row({ group: "Friends" })).skip).toMatch(/unknown Group/);
    expect(planRow(row({ name: "", email: "" }))).toBeNull();
  });

  it("carries the second email and the profile fields", () => {
    expect(planRow(row({ email2: "jane@home.com" })).fields).toMatchObject({ secondaryEmail: "jane@home.com", organization: "Acme", title: "CEO", firstName: "Jane" });
  });
});
