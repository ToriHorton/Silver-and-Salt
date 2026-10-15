import { describe, expect, it } from "vitest";
import { greetingName } from "../src/greeting-name.mjs";
import { namesFor } from "../_scripts/set-contact-names.mjs";

describe("greetingName", () => {
  it("greets by the preferred name, else the first name", () => {
    expect(greetingName({ firstName: "Patricia", preferredName: " Pat " })).toBe("Pat");
    expect(greetingName({ firstName: "Jane", preferredName: "" })).toBe("Jane");
    expect(greetingName({ firstName: "Jane" })).toBe("Jane");
    expect(greetingName(null)).toBe("");
  });
});

describe("namesFor", () => {
  it("takes the first name from the full Name when the given name is a nickname", () => {
    expect(namesFor({ name: "Patricia Jones Horton", given: "Pat", family: "Jones Horton", preferred: "Pat" }))
      .toEqual({ name: "Patricia Jones Horton", firstName: "Patricia", lastName: "Jones Horton", preferredName: "Pat" });
  });

  it("keeps two-word first names and trims stray spaces", () => {
    expect(namesFor({ name: "Anne Marie McDonald", given: "Anne Marie", family: "McDonald", preferred: "" }))
      .toEqual({ name: "Anne Marie McDonald", firstName: "Anne Marie", lastName: "McDonald", preferredName: "Anne Marie" });
    expect(namesFor({ name: "Tara Spalding", given: "Tara", family: " Spalding", preferred: "Tara" }).name).toBe("Tara Spalding");
  });

  it("builds the full name when the Name column is short", () => {
    expect(namesFor({ name: "Becki", given: "Becki", family: "W.", preferred: "" }).name).toBe("Becki W.");
    expect(namesFor({ name: "Chrisi", given: "Chrisi", family: "", preferred: "" })).toMatchObject({ name: "Chrisi", lastName: "" });
  });

  it("skips a row with no person", () => {
    expect(namesFor({ name: "", given: "", family: "", preferred: "" })).toBeNull();
  });
});
