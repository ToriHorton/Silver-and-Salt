// @vitest-environment happy-dom
//
// Click-through tests for the Action tab: every kind of person, every button,
// every Yes / Go back / Done, and what each sends to the server. They render
// the real tab in a simulated browser with a stand-in server, click like Tori
// would, and check both the screen and the requests.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { withActionTab } from "../src/app/admin/action-tab.jsx";

const NOW = Date.now();
const DAY = 864e5;
const ev = (event, label, daysAgo) => ({ id: event, event, label, occurredAt: NOW - daysAgo * DAY, method: "automatic", dateQuality: "exact" });

// The people the tab is tried with.
const PEOPLE = {
  paidBooked: {
    labels: { applicationId: "a1", action: "conversation_booked", actionLabel: "Conversation booked", type: "applicant", typeLabel: "Applicant", path: "website_first", pathLabel: "Website first", admission: "call_required", payment: "required", actionSince: NOW - 2 * DAY, revisitAt: null, flags: ["flag:attendance-unconfirmed"], proposal: null },
    history: [ev("applied", "Applied", 9), ev("paid", "Paid", 9), ev("conversation_booked", "Conversation booked", 2)],
    options: [{ id: "conversation_held", label: "Conversation held" }, { id: "fit", label: "A fit" }],
  },
  freeBooked: {
    labels: { applicationId: "a2", action: "conversation_booked", actionLabel: "Conversation booked", type: "applicant", typeLabel: "Applicant", path: "website_first", pathLabel: "Website first", admission: "call_required", payment: "not_required", actionSince: NOW - DAY, revisitAt: null, flags: [], proposal: null },
    history: [ev("applied", "Applied", 5), ev("conversation_booked", "Conversation booked", 1)],
    options: [],
  },
  waivedPaid: {
    labels: { applicationId: "a3", action: "paid", actionLabel: "Paid", type: "applicant", typeLabel: "Applicant", path: "relationship_first", pathLabel: "Relationship first", admission: "call_waived", waiverSource: "invitation", payment: "required", actionSince: NOW - DAY, revisitAt: null, flags: [], proposal: null },
    history: [ev("applied", "Applied", 2), ev("paid", "Paid", 1)],
    options: [],
  },
  missedPaid: {
    labels: { applicationId: "a4", action: "paid", actionLabel: "Paid", type: "applicant", typeLabel: "Applicant", path: "website_first", pathLabel: "Website first", admission: "call_required", payment: "required", actionSince: NOW, revisitAt: null, flags: [], proposal: null },
    history: [ev("applied", "Applied", 9), ev("paid", "Paid", 9)],
    options: [],
  },
  prospect: {
    labels: { applicationId: null, action: "contacted", actionLabel: "Contacted", type: "prospect", typeLabel: "Prospect", path: "relationship_first", pathLabel: "Relationship first", admission: null, payment: null, actionSince: NOW - 3 * DAY, revisitAt: null, flags: ["flag:move-to-confirm"], proposal: { action: "intro_booked", label: "Introduction booked", evidence: "calendar:ev1", reason: "A calendar event with them as a guest was found." } },
    history: [ev("identified", "Identified", 20)],
    options: [{ id: "intro_booked", label: "Introduction booked" }, { id: "keep_informed", label: "Keep informed" }, { id: "passed", label: "Passed" }],
  },
};

let root;
let calls;
let responses;

// A stand-in server: answers the person read, and records every write.
function serve(person) {
  calls = [];
  responses = {};
  window.fetch = async (url, opts = {}) => {
    const method = opts.method ?? "GET";
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (method === "GET") return new Response(JSON.stringify({ recordId: "r1", updatedAt: 7, ...person }), { status: 200 });
    calls.push({ url: String(url), body });
    const custom = Object.entries(responses).find(([k]) => String(url).includes(k));
    if (custom) return new Response(JSON.stringify(custom[1].body), { status: custom[1].status });
    return new Response(JSON.stringify({ ok: true, emailed: true }), { status: 200 });
  };
}

const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
async function mount(person) {
  serve(person);
  const tab = withActionTab([], { type: "person", detail: { record: { id: "r1" } } })[0];
  await act(async () => render(tab.panel, root));
  await flush();
}
const text = () => root.textContent;
const button = (label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const option = (label) => [...root.querySelectorAll(".jt-option")].find((o) => o.querySelector("b")?.textContent === label);
async function click(el) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => { el.click(); });
  await flush();
}
async function choose(label) {
  const input = option(label).querySelector("input");
  await act(async () => { input.checked = true; input.dispatchEvent(new Event("change", { bubbles: true })); input.dispatchEvent(new Event("click", { bubbles: true })); });
  await flush();
}

beforeEach(() => { root = document.createElement("div"); document.body.appendChild(root); });
afterEach(() => { render(null, root); root.remove(); });

describe("a paid member whose call is booked", () => {
  it("shows After the call with three decisions, and Save decision waits for a choice", async () => {
    await mount(PEOPLE.paidBooked);
    expect(text()).toContain("After the call");
    expect(text()).toContain("Saving records that the call took place");
    expect([...root.querySelectorAll(".jt-option b")].map((b) => b.textContent)).toEqual(["Approve", "Not a paid fit", "Refund and close"]);
    expect(button("Save decision").disabled).toBe(true);
    expect(button("They missed the call")).toBeTruthy();
    expect(text()).toContain("Attendance unconfirmed");
  });

  it("Go back sends nothing and keeps the choice", async () => {
    await mount(PEOPLE.paidBooked);
    await choose("Approve");
    await click(button("Save decision"));
    expect(text()).toContain("Approve this membership?");
    await click(button("Go back"));
    expect(calls).toEqual([]);
    expect(option("Approve").querySelector("input").checked).toBe(true);
  });

  it("Approve records the call with A fit, approves, and refreshes the labels", async () => {
    await mount(PEOPLE.paidBooked);
    await choose("Approve");
    await click(button("Save decision"));
    await click(button("Yes, approve"));
    expect(calls.map((c) => c.url)).toEqual(["/api/admin/labels/person/outcome", "/api/admin/applications/a1/approve", "/api/admin/labels/refresh"]);
    expect(calls[0].body).toMatchObject({ recordId: "r1", outcome: "fit", expectedUpdatedAt: 7 });
    expect(text()).toContain("Approved. The welcome email is on its way.");
  });

  it("Not a paid fit refunds and keeps them as an Associate", async () => {
    await mount(PEOPLE.paidBooked);
    await choose("Not a paid fit");
    await click(button("Save decision"));
    await click(button("Yes, refund and keep"));
    expect(calls[0].body.outcome).toBe("not_paid_fit");
    expect(calls[1]).toEqual({ url: "/api/admin/applications/a1/refund", body: { continueAs: "associate" } });
  });

  it("Refund and close refunds with no Associate", async () => {
    await mount(PEOPLE.paidBooked);
    await choose("Refund and close");
    await click(button("Save decision"));
    await click(button("Yes, refund and close"));
    expect(calls[0].body.outcome).toBe("not_fit");
    expect(calls[1]).toEqual({ url: "/api/admin/applications/a1/refund", body: {} });
  });

  it("when the operation fails, the decision stays saved and the message says to try again", async () => {
    await mount(PEOPLE.paidBooked);
    responses["/approve"] = { status: 409, body: { error: "approval effects pending" } };
    await choose("Approve");
    await click(button("Save decision"));
    await click(button("Yes, approve"));
    expect(calls.map((c) => c.url)).toEqual(["/api/admin/labels/person/outcome", "/api/admin/applications/a1/approve"]);
    expect(text()).toContain("Your decision is saved, but Approve did not finish: approval effects pending");
  });

  it("They missed the call: confirm, then the rebooking confirmation, then Done", async () => {
    await mount(PEOPLE.paidBooked);
    await click(button("They missed the call"));
    expect(text()).toContain("Mark the call as missed?");
    await click(button("Yes, send the rebooking email"));
    expect(calls).toEqual([{ url: "/api/admin/labels/person/no-show", body: { recordId: "r1", expectedUpdatedAt: 7 } }]);
    expect(text()).toContain("Rebooking email sent");
    expect(text()).not.toContain("What happens next");
    await click(button("Done"));
    expect(text()).not.toContain("Rebooking email sent");
  });

  it("They missed the call, Go back: nothing is sent", async () => {
    await mount(PEOPLE.paidBooked);
    await click(button("They missed the call"));
    await click(button("Go back"));
    expect(calls).toEqual([]);
    expect(text()).toContain("What happens next");
  });

  it("says so when the rebooking email could not be sent", async () => {
    await mount(PEOPLE.paidBooked);
    responses["no-show"] = { status: 200, body: { ok: true, emailed: false } };
    await click(button("They missed the call"));
    await click(button("Yes, send the rebooking email"));
    expect(text()).toContain("Call marked as missed");
    expect(text()).toContain("Reach out to them yourself");
  });
});

describe("an Associate whose call is booked", () => {
  it("offers Approve or Decline, and Decline sends the decline operation", async () => {
    await mount(PEOPLE.freeBooked);
    expect([...root.querySelectorAll(".jt-option b")].map((b) => b.textContent)).toEqual(["Approve", "Decline"]);
    await choose("Decline");
    await click(button("Save decision"));
    expect(text()).toContain("Decline this application?");
    await click(button("Yes, decline"));
    expect(calls.map((c) => c.url)).toEqual(["/api/admin/labels/person/outcome", "/api/admin/applications/a2/decline", "/api/admin/labels/refresh"]);
    expect(calls[0].body.outcome).toBe("not_fit");
  });
});

describe("someone invited (call waived) who has paid", () => {
  it("shows Decision, not After the call, and approves without recording a call", async () => {
    await mount(PEOPLE.waivedPaid);
    expect(root.querySelector('[aria-label="Decision"]')).toBeTruthy();
    expect(root.querySelector('[aria-label="After the call"]')).toBeNull();
    expect(text()).not.toContain("They missed the call");
    await choose("Approve");
    await click(button("Save decision"));
    expect(text()).not.toContain("Saving records that the call took place");
    await click(button("Yes, approve"));
    expect(calls.map((c) => c.url)).toEqual(["/api/admin/applications/a3/approve", "/api/admin/labels/refresh"]);
  });
});

describe("a paid member who missed their call", () => {
  it("shows no decision until they rebook", async () => {
    await mount(PEOPLE.missedPaid);
    expect(root.querySelector('[aria-label="After the call"]')).toBeNull();
    expect(root.querySelector('[aria-label="Decision"]')).toBeNull();
    expect(root.querySelectorAll(".jt-option").length).toBe(0);
  });
});

describe("a prospect", () => {
  it("Confirm takes the suggested move with its evidence", async () => {
    await mount(PEOPLE.prospect);
    expect(text()).toContain("Suggested update");
    await click(button("Confirm"));
    expect(calls[0]).toEqual({ url: "/api/admin/labels/person/action", body: { recordId: "r1", expectedUpdatedAt: 7, action: "intro_booked", method: "confirmed", evidence: "calendar:ev1" } });
  });

  it("Dismiss sends the dismissal with its evidence", async () => {
    await mount(PEOPLE.prospect);
    await click(button("Dismiss"));
    expect(calls[0]).toEqual({ url: "/api/admin/labels/person/dismiss", body: { recordId: "r1", expectedUpdatedAt: 7, action: "intro_booked", evidence: "calendar:ev1" } });
  });

  it("Update the relationship: Keep informed sends a revisit date", async () => {
    await mount(PEOPLE.prospect);
    expect(root.querySelector('[aria-label="After the call"]')).toBeNull();
    const select = root.querySelector("select.jt-select");
    await act(async () => { select.value = "keep_informed"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    await click(button("Save"));
    expect(calls[0].url).toBe("/api/admin/labels/person/action");
    expect(calls[0].body.action).toBe("keep_informed");
    expect(typeof calls[0].body.revisitAt).toBe("number");
    expect(calls[0].body.revisitAt).toBeGreaterThan(NOW + 80 * DAY);
  });

  it("Save stays off until a step is chosen", async () => {
    await mount(PEOPLE.prospect);
    expect(button("Save").disabled).toBe(true);
  });
});
