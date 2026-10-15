// Which decisions the Action tab offers after a call (src/app/admin/action-tab.jsx).
import { describe, expect, it } from "vitest";
import { decisionFor } from "../src/app/admin/action-tab.jsx";

const paidHistory = [{ event: "applied" }, { event: "paid" }];
const labels = (over) => ({ applicationId: "a1", admission: "call_required", payment: "required", ...over });

describe("decisionFor", () => {
  it("offers a paid applicant's three decisions in the After the call panel while the call is booked", () => {
    const d = decisionFor(labels({ action: "conversation_booked" }), paidHistory);
    expect(d.callPanel).toBe(true);
    expect(d.choices).toEqual(["approve", "not-paid-fit", "refund"]);
    expect(d.recordedPick).toBe("");
  });

  it("offers Approve or Decline to someone who holds no payment", () => {
    const d = decisionFor(labels({ action: "conversation_held", payment: "not_required" }), [{ event: "applied" }]);
    expect(d.choices).toEqual(["approve", "decline"]);
  });

  it("keeps the panel open with the recorded decision picked when its operation has not finished", () => {
    expect(decisionFor(labels({ action: "fit" }), paidHistory)).toMatchObject({ callPanel: true, recordedPick: "approve" });
    expect(decisionFor(labels({ action: "not_fit" }), paidHistory).recordedPick).toBe("refund");
    expect(decisionFor(labels({ action: "not_fit", payment: "not_required" }), []).recordedPick).toBe("decline");
  });

  it("uses the plain Decision panel on a waived path, and nothing once decided", () => {
    expect(decisionFor(labels({ action: "paid", admission: "call_waived" }), paidHistory)).toMatchObject({ callPanel: false, canDecide: true });
    expect(decisionFor(labels({ action: "approved" }), paidHistory)).toMatchObject({ callPanel: false, canDecide: false, choices: [] });
  });
});
