import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { activityCategory, guessActivity, mayRelink, mayRemove, removeExpense, removePayment, rewishOps, wishOf } from "../src/money.ts";
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

const dream = (id: string, title: string, category: string) => ({ id, title, category, source: "", icon: "x", votes: 0 });
const wishTrip = () => {
  const t = trip();
  t.dreams = [dream("w-zoo", "Zoo", "Aktivitet"), dream("w-museum", "Museum", "Museum"), dream("w-glass", "Glass", "Mat")];
  t.days[0].activities[0].dreamId = "w-museum"; // planned on the first day
  t.days[1].activities[0].dreamId = "w-zoo"; // planned on another day
  return t;
};

// REQ: MI-41 changing the wish and category, saved together: the wish's activity on the expense's day, else none; "Ingen" removes both
test("MI-41 changing an expense's wish", () => {
  const t = wishTrip();
  const museum = rewishOps(t, "e1", "w-museum", "Upplevelse");
  assert.deepEqual(museum, { ok: true, ops: [{ op: "set", path: "expenses/0/dreamId", value: "w-museum" }] }, "planned that day: its activity stays");
  const zoo = rewishOps(t, "e1", "w-zoo", "Upplevelse");
  assert.ok(zoo.ok);
  const z = Trip.parse(applyOps(t, zoo.ops)).expenses[0];
  assert.deepEqual([z.dreamId, z.activityId], ["w-zoo", undefined], "planned on another day: no activity");
  const glass = rewishOps(t, "e1", "w-glass", "Mat");
  assert.ok(glass.ok);
  assert.deepEqual(Trip.parse(applyOps(t, glass.ops)).expenses[0].category, "Mat");
  const none = rewishOps(Trip.parse(applyOps(t, museum.ok ? museum.ops : [])), "e1", "", "Upplevelse");
  assert.ok(none.ok);
  const n = Trip.parse(applyOps(Trip.parse(applyOps(t, museum.ok ? museum.ops : [])), none.ops)).expenses[0];
  assert.deepEqual([n.dreamId, n.activityId], [undefined, undefined]);
  assert.equal(rewishOps(t, "e1", "nope", "Mat").ok, false);
  assert.equal(rewishOps(t, "nope", "", "Mat").ok, false);
  assert.deepEqual(wishOf(t, t.expenses[0]), "w-museum", "the dialog starts on the activity's wish");
  assert.equal(sv.minnas.relink("Glass"), "Ändra vilken önskning Glass gäller");
  assert.equal(sv.minnas.relinkTitle, "Önskning");
});

// REQ: MI-41 who may change it: a Planerare and the superuser every expense, a traveler their own
test("MI-41 who may change an expense's wish", () => {
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
