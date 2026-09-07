import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isAdminAuthorized } from "../src/app/admin/authorization.mjs";

it.each([
  ["admin only", { authorized: true, role: "admin", memberAccess: false }, true],
  ["protected nonmember", { authorized: true, role: "provisional", superAdmin: true, memberAccess: false }, true],
  ["admin and member", { authorized: true, role: "admin", memberAccess: true }, true],
  ["member only", { authorized: false, role: "member", memberAccess: true }, false],
  ["neither", { authorized: false, role: "provisional", memberAccess: false }, false],
  ["stale admin role", { authorized: false, role: "admin" }, false],
  ["missing verdict", { role: "admin", superAdmin: true }, false],
  ["truthy string", { authorized: "true" }, false],
  ["unavailable user", null, false],
])("%s follows only the server authorization verdict", (_name, user, allowed) => {
  expect(isAdminAuthorized(user)).toBe(allowed);
});

it("uses the same gate for bootstrap and the Chapter adapter", () => {
  const source = readFileSync(new URL("../src/app/admin/index.jsx", import.meta.url), "utf8");
  expect(source).toContain("if (!isAdminAuthorized(me))");
  expect(source).toContain("isAuthorized: isAdminAuthorized");
  expect(source).not.toContain('me.role !== "admin"');
  expect(source).not.toContain('u?.role === "admin"');
});
