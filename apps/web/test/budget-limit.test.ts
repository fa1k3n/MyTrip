import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { budgetLimit } from "../src/budget.ts";
import { saveBudgetMax } from "../src/edit.ts";
import { newExpense, pickAdder } from "../src/money.ts";

const trip = (extra: object = {}) => Trip.parse({
  id: "t", revision: 1, title: "t", timezone: "Europe/Berlin", stops: [], days: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  budget: [{ id: "b1", category: "Boende", amount: 7000, paid: true }, { id: "b2", category: "Övrigt", amount: 100, currency: "EUR", paid: false }],
  ...extra,
});

// REQ: BG-12 the admin sets, changes and clears the maximum budget
test("BG-12 saveBudgetMax", () => {
  const r = saveBudgetMax(trip(), "15 000");
  assert.ok(r.ok);
  assert.equal(applyOps(trip(), r.ok ? r.ops : []).budgetMax, 15000);
  const clear = saveBudgetMax(trip({ budgetMax: 15000 }), " ");
  assert.ok(clear.ok);
  assert.equal(Trip.parse(applyOps(trip({ budgetMax: 15000 }), clear.ok ? clear.ops : [])).budgetMax, undefined);
  assert.deepEqual(saveBudgetMax(trip(), ""), { ok: true, ops: [] }); // nothing to clear
  assert.equal(saveBudgetMax(trip(), "mycket").ok, false);
});

// REQ: BG-13 planned budget in the trip currency plus expenses, compared with the maximum: warning from 80 %, stronger above it
test("BG-13 budgetLimit", () => {
  const exp = (amount: number) => [{ id: "e", text: "x", category: "Övrigt", amount, paidBy: "anna", sharedBy: [] }];
  assert.equal(budgetLimit(trip(), ), null);
  assert.deepEqual(budgetLimit(trip({ budgetMax: 10000, expenses: exp(500) })), { used: 7500, max: 10000, percent: 75, left: 2500, level: "ok" });
  assert.equal(budgetLimit(trip({ budgetMax: 10000, expenses: exp(1000) }))!.level, "near"); // exactly 80 %
  assert.equal(budgetLimit(trip({ budgetMax: 10000, expenses: exp(3000) }))!.level, "near"); // at the maximum, not over it
  assert.deepEqual(budgetLimit(trip({ budgetMax: 10000, expenses: exp(3200.5) })), { used: 10200.5, max: 10000, percent: 102, left: -200.5, level: "over" });
});

// REQ: UP-13 the expense records who added it and when; the remembered choice is used when that traveler still exists
test("UP-13 newExpense and pickAdder", () => {
  const r = newExpense(trip(), { text: " Glass ", amount: "60", category: "Mat/Fritid", paidBy: "bo", sharedBy: ["anna", "bo"], addedBy: "anna" }, "2026-10-25", "2026-10-25T12:00:00.000Z", "exp-1");
  assert.ok(r.ok);
  const t = Trip.parse(applyOps(trip(), r.ok ? r.ops : []));
  assert.deepEqual(t.expenses[0], { id: "exp-1", text: "Glass", category: "Mat/Fritid", amount: 60, paidBy: "bo", sharedBy: [], date: "2026-10-25", addedBy: "anna", addedAt: "2026-10-25T12:00:00.000Z" });
  assert.equal(newExpense(trip(), { text: "Glass", amount: "x", category: "Övrigt", paidBy: "bo", sharedBy: [], addedBy: "anna" }, "2026-10-25", "", "e").ok, false);
  assert.equal(newExpense(trip(), { text: " ", amount: "5", category: "Övrigt", paidBy: "bo", sharedBy: [], addedBy: "anna" }, "2026-10-25", "", "e").ok, false);
  assert.equal(pickAdder(trip().travelers, "bo"), "bo");
  assert.equal(pickAdder(trip().travelers, "borta"), "anna");
  assert.equal(pickAdder(trip().travelers, null), "anna");
});
