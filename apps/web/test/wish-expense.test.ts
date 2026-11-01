import { test } from "node:test";
import assert from "node:assert/strict";
import { activityExpense, guessWish, paidTotals, wishChoices, wishExpense } from "../src/money.ts";

const day = { activities: [
  { id: "frukost", text: "Frukost", start: "08:00", durationMin: 60 },
  { id: "museum", text: "Museum", start: "10:00", end: "12:00", dreamId: "w-museum" },
  { id: "secret", text: "", start: "12:30", hidden: true, dreamId: "w-secret" },
] };
const dreams = [{ id: "w-zoo", title: "Zoo", category: "Aktivitet" }, { id: "w-museum", title: "Museum", category: "Museum" }, { id: "w-secret", title: "Hemligt", category: "Mat" }];

// REQ: UP-47 the wishes to choose among: those planned on the day first, then the rest; a wish only through a hidden activity is not first
test("UP-47 wishChoices", () => {
  assert.deepEqual(wishChoices(day, dreams), [
    { id: "w-museum", text: "Museum", category: "Museum", activityId: "museum" },
    { id: "w-zoo", text: "Zoo", category: "Aktivitet" },
    { id: "w-secret", text: "Hemligt", category: "Mat" },
  ]);
});

// REQ: UP-47 the guess is the wish of the activity going on
test("UP-47 guessWish", () => {
  assert.equal(guessWish(day.activities, "10:30"), "w-museum");
  assert.equal(guessWish(day.activities, "08:30"), undefined, "an activity without a wish");
  assert.equal(guessWish(day.activities, undefined), undefined);
});

// REQ: UP-47 the expense records the wish and, when planned that day, its activity; from an activity's card its wish too
test("UP-47 wishExpense and activityExpense", () => {
  assert.deepEqual(wishExpense({ id: "w-museum", text: "Museum", category: "Museum", activityId: "museum" }, { text: " ", amount: "120", category: "Upplevelse" }, "anna", []),
    { text: "Museum", amount: "120", category: "Upplevelse", paidBy: "anna", sharedBy: [], addedBy: "anna", dreamId: "w-museum", activityId: "museum" });
  assert.deepEqual(wishExpense({ id: "w-zoo", text: "Zoo" }, { text: "Glass", amount: "5", category: "Mat" }, "bo", ["bo"]),
    { text: "Glass", amount: "5", category: "Mat", paidBy: "bo", sharedBy: ["bo"], addedBy: "bo", dreamId: "w-zoo" });
  assert.equal(activityExpense({ id: "museum", text: "Museum", category: "Museum", dreamId: "w-museum" }, { text: "", amount: "1" }, "anna", []).dreamId, "w-museum");
  assert.equal("dreamId" in activityExpense({ id: "frukost", text: "Frukost" }, { text: "", amount: "1" }, "anna", []), false);
});

// REQ: MI-40 each traveler's total: the expenses they paid that count in the balances
test("MI-40 paidTotals", () => {
  const people = [{ id: "anna" }, { id: "bo" }, { id: "kalle" }];
  assert.deepEqual(paidTotals(people, [{ paidBy: "anna", amount: 100.25 }, { paidBy: "bo", amount: 40 }, { paidBy: "anna", amount: 0.1 }]), { anna: 100.35, bo: 40, kalle: 0 });
});
