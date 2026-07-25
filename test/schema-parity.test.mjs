// The standing guard on the chapter conversion.
//
// test/fixtures/legacy-schema.mjs is a frozen copy of the odla-db schema this
// site ran BEFORE adopting @odla-ai/chapter. Chapter now generates the schema,
// and a generated schema can drift with a package upgrade without any local
// diff. This asserts byte-equality against the frozen fixture, which is what
// made deleting the hand-written schema safe rather than hopeful.
//
// If this fails after a chapter upgrade, do NOT edit the fixture. The fixture is
// the record of what the live dev and prod tenants actually hold. Either the
// config needs to change, or chapter changed a namespace and that is upstream
// feedback.

import { describe, expect, it } from "vitest";
import { schema as legacy } from "./fixtures/legacy-schema.mjs";
import { chapter } from "../src/chapter.config.mjs";

const ATTR_FLAGS = ["type", "unique", "indexed", "optional"];

describe("chapter schema parity with the pre-conversion schema", () => {
  it("declares exactly the same namespaces", () => {
    expect(Object.keys(chapter.schema.entities).sort()).toEqual(
      Object.keys(legacy.entities).sort(),
    );
  });

  for (const ns of Object.keys(legacy.entities)) {
    describe(ns, () => {
      it("declares exactly the same attributes", () => {
        expect(Object.keys(chapter.schema.entities[ns].attrs).sort()).toEqual(
          Object.keys(legacy.entities[ns].attrs).sort(),
        );
      });

      it("declares the same type, uniqueness, index, and optionality for each", () => {
        const actual = {};
        const expected = {};
        for (const [attr, spec] of Object.entries(legacy.entities[ns].attrs)) {
          const live = chapter.schema.entities[ns].attrs[attr] ?? {};
          actual[attr] = Object.fromEntries(ATTR_FLAGS.map((f) => [f, live[f]]));
          expected[attr] = Object.fromEntries(ATTR_FLAGS.map((f) => [f, spec[f]]));
        }
        expect(actual).toEqual(expected);
      });
    });
  }

  it("keeps rules deny-all on every namespace", () => {
    // Browsers hold no db credential; the worker mediates every read and write
    // with the app admin key. A widened rule here would be a silent hole.
    for (const [ns, rule] of Object.entries(chapter.rules)) {
      expect({ ns, ...rule }).toEqual({
        ns,
        view: "false",
        create: "false",
        update: "false",
        delete: "false",
      });
    }
  });
});
