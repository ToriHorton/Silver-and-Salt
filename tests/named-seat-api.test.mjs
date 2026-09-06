import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { client, create } = vi.hoisted(() => {
  const client = { load: vi.fn(async () => {}), getToken: vi.fn(async () => "synthetic-jwt"), instance: { openSignIn: vi.fn(async () => {}) } };
  return { client, create: vi.fn(() => client) };
});
vi.mock("@odla-ai/auth-clerk", () => ({ createClerkClient: create }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); client.getToken.mockResolvedValue("synthetic-jwt");
  vi.stubGlobal("window", { location: { pathname: "/apply", search: "?seat=seat_test&tier=standard" } });
});
afterEach(() => vi.unstubAllGlobals());
describe("named seat sign-in seam", () => {
  it("signs only the expected command and rejects arbitrary URLs", async () => {
    const send = vi.fn(async path => new Response(JSON.stringify(path === "/api/config" ? { clerkPublishableKey: "pk_test_synthetic" } : { ok: true })));
    vi.stubGlobal("fetch", send);
    const { namedSeatClaimApi } = await import("../src/app/named-seat-api.mjs");
    await expect(namedSeatClaimApi("https://other.example", { method: "POST" })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    await expect(namedSeatClaimApi("/api/named-seat/accept", { method: "POST", body: "{}" })).resolves.toEqual({ ok: true });
    expect(send.mock.calls[1][1].headers.authorization).toBe("Bearer synthetic-jwt");
  });
  it("opens sign-in with the complete invitation URL and performs no unauthenticated acceptance", async () => {
    client.getToken.mockResolvedValue(null);
    const send = vi.fn(async () => new Response(JSON.stringify({ clerkPublishableKey: "pk_test_synthetic" })));
    vi.stubGlobal("fetch", send);
    const { namedSeatClaimApi } = await import("../src/app/named-seat-api.mjs");
    await expect(namedSeatClaimApi("/api/named-seat/accept", { method: "POST", body: "{}" })).rejects.toThrow("sign in");
    expect(client.instance.openSignIn).toHaveBeenCalledWith({ forceRedirectUrl: "/apply?seat=seat_test&tier=standard" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

