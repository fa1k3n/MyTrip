import { test } from "node:test";
import assert from "node:assert/strict";
import { Expense, Trip } from "@trip/schema";
import { durationText } from "../src/upday.ts";
import { clockIn } from "../src/today.ts";
import { activityExpense, newExpense } from "../src/money.ts";
import { sv } from "../src/sv.ts";

type A = { id: string; text: string; start?: string; end?: string; durationMin?: number; estimated: boolean };
const a = (id: string, start: string | undefined, x: Partial<A> = {}): A => ({ id, text: id, start, estimated: false, ...x });

// REQ: UP-16 how long an activity takes: "ca" from an estimated duration, none from a fixed end
test("UP-16 durationText", () => {
  assert.equal(durationText(a("x", "09:00", { durationMin: 30 })), "ca 30 min");
  assert.equal(durationText(a("x", "09:00", { durationMin: 60 })), "ca 1 tim");
  assert.equal(durationText(a("x", "09:00", { durationMin: 90 })), "ca 1 tim 30 min");
  assert.equal(durationText(a("x", "09:00", { end: "11:00" })), "2 tim");
  assert.equal(durationText(a("x", "09:00", { end: "11:00", durationMin: 30 })), "2 tim"); // a fixed end wins (DM-13)
  assert.equal(durationText(a("x", "09:00")), ""); // a Klockslag or an unknown length
  assert.equal(durationText(a("x", undefined, { durationMin: 45 })), "ca 45 min");
});

// REQ: UP-18 the clock in the trip's time zone
test("UP-18 clockIn", () => {
  const at = new Date("2026-10-26T14:52:30Z");
  assert.equal(clockIn("Europe/Stockholm", at), "15:52");
  assert.equal(clockIn("UTC", at), "14:52");
  assert.equal(clockIn("Europe/Stockholm", new Date("2026-10-26T23:05:00Z")), "00:05"); // never "24:05"
});

// REQ: UP-20 an expense for an activity records the activity
test("UP-20 newExpense with activityId", () => {
  const t = Trip.parse({
    id: "t", revision: 1, title: "t", timezone: "Europe/Berlin", stops: [], days: [], places: [], bookings: [], tasks: [], budget: [],
    travelers: [{ id: "anna", name: "Anna", packing: [] }],
  });
  const r = newExpense(t, { text: "Middag", amount: "420", category: "Mat/Fritid", paidBy: "anna", sharedBy: ["anna"], addedBy: "anna", activityId: "a7" }, "2026-10-26", "2026-10-26T17:00:00.000Z", "exp-1");
  assert.ok(r.ok);
  const value = r.ok ? r.ops[0].value as Record<string, unknown> : {};
  assert.equal(value.activityId, "a7");
  assert.equal(Expense.parse(value).activityId, "a7");
  const plain = newExpense(t, { text: "Glass", amount: "60", category: "Mat/Fritid", paidBy: "anna", sharedBy: ["anna"], addedBy: "anna" }, "2026-10-26", "2026-10-26T17:00:00.000Z", "exp-2");
  assert.equal(plain.ok && "activityId" in (plain.ops[0].value as object), false); // optional
});

// REQ: UP-22 the short expense form for an activity: amount and an optional description; category from the activity
test("UP-22 activityExpense", () => {
  const lunch = { id: "a7", text: "Lunch i Lübeck", category: "Mat" };
  assert.deepEqual(activityExpense(lunch, { text: " ", amount: "420" }, "anna", ["anna", "bo"]),
    { text: "Lunch i Lübeck", amount: "420", category: "Mat/Fritid", paidBy: "anna", sharedBy: ["anna", "bo"], addedBy: "anna", activityId: "a7" });
  assert.equal(activityExpense(lunch, { text: " Glass ", amount: "60" }, "anna", []).text, "Glass");
  assert.equal(activityExpense({ ...lunch, category: "Resa" }, { text: "", amount: "1" }, "anna", []).category, "Transport");
  assert.equal(activityExpense({ ...lunch, category: "Klockslag" }, { text: "", amount: "1" }, "anna", []).category, "Övrigt");
  assert.equal(activityExpense({ ...lunch, category: "Museum" }, { text: "", amount: "1" }, "anna", []).category, "Mat/Fritid");
  assert.equal(activityExpense({ id: "x", text: "Okänd" }, { text: "", amount: "1" }, "anna", []).category, "Övrigt");
  assert.equal(sv.up.expenseTitle("Lunch i Lübeck"), "Nytt utlägg för Lunch i Lübeck");
});
