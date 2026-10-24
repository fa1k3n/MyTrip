import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "../src/schema.ts";
import { checkTrip } from "../src/check.ts";

const base = {
  id: "t", revision: 1, title: "t", timezone: "Europe/Stockholm", stops: [], days: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "erik", name: "Erik", packing: [] }],
};

// REQ: MI-02 an expense records description, amount, category, payer and sharers; no sharers means everyone
test("MI-02 Trip accepts expenses and defaults sharers to everyone", () => {
  const t = Trip.parse({ ...base, expenses: [{ id: "e1", text: "Lunch", category: "Mat/Fritid", amount: 640.5, paidBy: "anna" }] });
  assert.deepEqual(t.expenses[0].sharedBy, []);
  assert.deepEqual(Trip.parse(base).payments, []);
  assert.throws(() => Trip.parse({ ...base, expenses: [{ id: "e1", text: "Lunch", category: "Mat", amount: 0, paidBy: "anna" }] }));
});

// REQ: MI-06 a payment goes between two different travelers
test("MI-06 Trip rejects a payment to oneself", () => {
  const ok = Trip.parse({ ...base, payments: [{ id: "p1", from: "erik", to: "anna", amount: 200, date: "2026-10-30" }] });
  assert.equal(ok.payments[0].amount, 200);
  assert.throws(() => Trip.parse({ ...base, payments: [{ id: "p1", from: "anna", to: "anna", amount: 200 }] }));
});

// REQ: MI-01 expenses and payments must refer to existing travelers
test("MI-01 checkTrip reports unknown travelers", () => {
  const t = Trip.parse({
    ...base,
    expenses: [{ id: "e1", text: "Lunch", category: "Mat", amount: 100, paidBy: "lisa", sharedBy: ["anna", "olle"] }],
    payments: [{ id: "p1", from: "erik", to: "kim", amount: 50 }],
  });
  const p = checkTrip(t);
  for (const who of ["lisa", "olle", "kim"]) assert.ok(p.some((m) => m.includes(`unknown traveler ${who}`)), who);
  assert.deepEqual(checkTrip(Trip.parse(base)), []);
});
