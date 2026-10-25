import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTrip, Trip } from "../src/index.ts";

const base = {
  id: "t", revision: 1, title: "t", timezone: "UTC", stops: [], days: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }],
};

// REQ: BG-12 the trip may have a maximum budget, a positive amount in the trip's currency
test("BG-12 Trip accepts a positive budgetMax only", () => {
  assert.equal(Trip.parse({ ...base, budgetMax: 15000 }).budgetMax, 15000);
  assert.equal(Trip.parse(base).budgetMax, undefined);
  for (const v of [0, -5, "15000"]) assert.equal(Trip.safeParse({ ...base, budgetMax: v }).success, false, String(v));
});

// REQ: UP-13 an expense records who added it and when; who must be a traveler
test("UP-13 expense addedBy and addedAt", () => {
  const e = { id: "e1", text: "Glass", category: "Mat/Fritid", amount: 60, paidBy: "anna", addedBy: "anna", addedAt: "2026-10-25T12:00:00.000Z" };
  const t = Trip.parse({ ...base, expenses: [e] });
  assert.deepEqual([t.expenses[0].addedBy, t.expenses[0].addedAt], ["anna", "2026-10-25T12:00:00.000Z"]);
  assert.deepEqual(checkTrip(t), []);
  assert.ok(checkTrip(Trip.parse({ ...base, expenses: [{ ...e, addedBy: "okand" }] })).some((m) => m.includes("unknown traveler okand")));
  assert.equal(Trip.safeParse({ ...base, expenses: [{ ...e, addedAt: "igår" }] }).success, false);
});
