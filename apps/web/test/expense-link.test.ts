import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { activityCategory, guessActivity, linkChoices, mayRelink, mayRemove, relinkOps, removeExpense, removePayment } from "../src/money.ts";
import { burstLabel } from "../src/celebrate.ts";
import { sv } from "../src/sv.ts";

const a = (id: string, start: string | undefined, extra: object = {}) => ({ id, text: id, placeIds: [], estimated: false, ...(start ? { start } : {}), ...extra });
const day = [a("frukost", "08:00", { end: "08:30" }), a("museum", "10:00", { durationMin: 120, category: "Museum" }), a("dold", "12:30", { durationMin: 30, hidden: true }),
  a("lunch", "13:00", { durationMin: 30, category: "Mat" }), a("utan", undefined)];

// REQ: UP-43 the guessed activity: the one going on by the plan, else the one that started less than an hour ago; none on other days
test("UP-43 guessing the activity", () => {
  assert.equal(guessActivity(day, "10:30"), "museum", "going on");
  assert.equal(guessActivity(day, "11:59"), "museum");
  assert.equal(guessActivity(day, "12:20"), undefined, "ended 12.00 and started over an hour ago");
  assert.equal(guessActivity(day, "08:45"), "frukost", "ended, but started less than an hour ago");
  assert.equal(guessActivity(day, "09:59"), undefined, "started an hour or more ago and ended");
  assert.equal(guessActivity(day, "12:45"), undefined, "a hidden activity is never guessed");
  assert.equal(guessActivity(day, "13:10"), "lunch");
  assert.equal(guessActivity(day, "07:00"), undefined, "before the first");
  assert.equal(guessActivity(day, undefined), undefined, "not today");
  assert.deepEqual([sv.up.applies, sv.up.noActivity], ["Aktivitet", "Ingen"]);
});

// REQ: UP-43 choosing an activity chooses its category
test("UP-43 the category follows the chosen activity", () => {
  assert.deepEqual(["Museum", "Mat", "Resa", "Klockslag", "Shopping", undefined].map(activityCategory), ["Upplevelse", "Mat", "Transport", "Övrigt", "Shopping", "Övrigt"]);
});

// REQ: UP-44 the rising amount names the activity
test("UP-44 the rising amount with the activity", () => {
  assert.equal(burstLabel({ amount: 45 }, "SEK", "Museum"), "+45 kr · Museum");
  assert.equal(burstLabel({ amount: 45 }, "SEK"), "+45 kr");
});

const trip = () => Trip.parse({ id: "t", revision: 1, title: "t", timezone: "UTC", stops: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [
    { id: "d1", date: "2026-10-25", title: "Dag 1", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [a("museum", "10:00", { category: "Museum" }), a("dold", "12:00", { hidden: true }), a("glass", "14:00", { category: "Mat" })] },
    { id: "d2", date: "2026-10-26", title: "Dag 2", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [a("zoo", "10:00", { category: "Aktivitet" })] },
  ],
  expenses: [
    { id: "e1", text: "Glass", category: "Upplevelse", amount: 45, paidBy: "bo", sharedBy: [], date: "2026-10-25", activityId: "museum", addedBy: "bo" },
    { id: "e2", text: "Zoo", category: "Upplevelse", amount: 300, paidBy: "anna", sharedBy: [], date: "2026-10-25", activityId: "zoo", addedBy: "anna" },
    { id: "e3", text: "Bensin", category: "Transport", amount: 500, paidBy: "anna", sharedBy: [] },
  ] });

// REQ: MI-32 the choices: the activities of the expense's day that are not hidden, and its current one
test("MI-32 the activities to choose among", () => {
  const t = trip();
  assert.deepEqual(linkChoices(t, t.expenses[0]).map((x) => x.id), ["museum", "glass"]);
  assert.deepEqual(linkChoices(t, t.expenses[1]).map((x) => x.id), ["museum", "glass", "zoo"], "its current one from another day too");
  assert.deepEqual(linkChoices(t, t.expenses[2]).map((x) => x.id), [], "no date: no day");
});

// REQ: MI-32 changing the activity and category, saved together; nothing when nothing changes
test("MI-32 changing an expense's activity", () => {
  const t = trip();
  const to = relinkOps(t, "e1", "glass", "Mat");
  assert.ok(to.ok);
  assert.deepEqual(Trip.parse(applyOps(t, to.ops)).expenses[0], { ...t.expenses[0], activityId: "glass", category: "Mat" });
  const none = relinkOps(t, "e1", "", "Mat");
  assert.ok(none.ok);
  assert.equal(Trip.parse(applyOps(t, none.ops)).expenses[0].activityId, undefined);
  assert.deepEqual(relinkOps(t, "e1", "museum", "Upplevelse"), { ok: true, ops: [] });
  assert.equal(relinkOps(t, "e1", "nope", "Mat").ok, false);
  assert.equal(relinkOps(t, "nope", "", "Mat").ok, false);
  assert.equal(sv.minnas.relink("Glass"), "Ändra vilken aktivitet Glass gäller");
});

// REQ: MI-32 who may change it: a Planerare and the superuser every expense, a traveler their own
test("MI-32 who may change an expense's activity", () => {
  const e = trip().expenses[0];
  assert.equal(mayRelink(e, { manager: true }), true);
  assert.equal(mayRelink(e, { manager: false, self: "bo" }), true);
  assert.equal(mayRelink(e, { manager: false, self: "anna" }), false);
  assert.equal(mayRelink(e, { manager: false }), false);
});

// REQ: MI-34 removing an expense: only a Planerare or the superuser, and the change removes exactly that expense
test("MI-34 removeExpense", () => {
  const t = { expenses: [{ id: "a" }, { id: "b" }] };
  assert.deepEqual(removeExpense(t, "b"), [{ op: "remove", path: "expenses/1" }]);
  assert.deepEqual(removeExpense(t, "x"), []);
  assert.equal(mayRemove({ manager: false }), false, "a traveler, not even their own (AU-13)");
  assert.equal(mayRemove({ manager: true }), true);
});

// REQ: MI-35 removing a payment removes exactly that payment
test("MI-35 removePayment", () => {
  const t = { payments: [{ id: "a" }, { id: "b" }] };
  assert.deepEqual(removePayment(t, "b"), [{ op: "remove", path: "payments/1" }]);
  assert.deepEqual(removePayment(t, "x"), []);
});
