// What Built Not Found Capital can see of this chapter's CRM.
//
// Tori's decision, 2026-09-24: the parent gets relationship temperature
// (`lastCallAt`, `callCount`) and no call content. Call summaries, action
// items, and meeting titles stay follower-private in the activity feed.
//
// These tests exist because that boundary is easy to erode by accident. The
// federation projection (`NetworkRecord`) carries `fields` verbatim, so
// anything added to the allowlist below crosses to the parent immediately,
// with no separate review. A future field called `lastCallSummary` would leak
// the contents of private financial conversations to a parent entity the
// moment someone added it to that array, and nothing else in the build would
// notice. This notices.

import { describe, expect, it } from "vitest";
import { chapterFor } from "../src/chapter.config.mjs";
import { crm } from "../src/crm.mjs";

const readerFor = (envName, id) => {
  const readers = chapterFor(envName).config.network?.readers ?? [];
  return readers.find((r) => r.id === id) ?? null;
};

// Call-derived values the parent is allowed to read. Extending this set is a
// privacy decision, so it is spelled out here and asserted exactly.
const ALLOWED_CALL_FIELDS = ["lastCallAt", "callCount"];

describe("the Built Not Found reader", () => {
  for (const envName of ["dev", "prod"]) {
    describe(`in ${envName}`, () => {
      const reader = readerFor(envName, "built-not-found");

      it("exists and can read person records", () => {
        expect(reader).toBeTruthy();
        expect(reader.fields?.person).toBeInstanceOf(Array);
      });

      it("reads relationship temperature", () => {
        for (const f of ALLOWED_CALL_FIELDS) {
          expect(reader.fields.person).toContain(f);
        }
      });

      it("reads no call content", () => {
        // Any call-derived person field that is NOT on the allowlist must stay
        // out of the projection. Computed from the CRM config, so a new field
        // is caught the day it is added rather than the day someone notices.
        const callish = Object.keys(crm.config.types.person.fields).filter((name) =>
          /call|meeting|transcript|summary|note|granola/i.test(name),
        );
        const leaked = callish
          .filter((f) => !ALLOWED_CALL_FIELDS.includes(f))
          .filter((f) => reader.fields.person.includes(f));
        expect(leaked).toEqual([]);
      });

      it("cannot write the counters back, since only this chapter knows when a call happened", () => {
        const editable = reader.editableFields?.person ?? [];
        for (const f of ALLOWED_CALL_FIELDS) {
          expect(editable).not.toContain(f);
        }
      });

      it("keeps every editable field readable, as the package requires", () => {
        for (const f of reader.editableFields?.person ?? []) {
          expect(reader.fields.person).toContain(f);
        }
      });
    });
  }
});

describe("the counter fields themselves", () => {
  const fields = crm.config.types.person.fields;

  it("are promoted to distinct pre-declared slots", () => {
    expect(fields.lastCallAt.slot).toBe("d1");
    expect(fields.callCount.slot).toBe("n1");
  });

  it("do not collide with any other promoted field", () => {
    const slots = Object.values(fields).map((f) => f.slot).filter(Boolean);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("carry the types the parent will sort on", () => {
    expect(fields.lastCallAt.type).toBe("date");
    expect(fields.callCount.type).toBe("number");
  });
});
