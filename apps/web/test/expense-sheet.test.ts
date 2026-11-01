import { test } from "node:test";
import assert from "node:assert/strict";
import { expenseTiles } from "../src/money.ts";
import { sv } from "../src/sv.ts";

// REQ: UP-41 the floating add button for an expense without an activity: the banknote with a plus and "Lägg till utlägg"
test("UP-41 the add button's label", () => {
  assert.equal(sv.addExpense, "Lägg till utlägg");
});

// REQ: UP-42 the form for an expense without an activity: category tiles with icons, Mat chosen at first, its own texts
test("UP-42 the expense sheet", () => {
  const tiles = expenseTiles();
  assert.deepEqual(tiles.map((x) => x.name), ["Boende", "Transport", "Mat", "Upplevelse", "Shopping", "Övrigt"], "the categories of MI-30, in their order");
  assert.deepEqual(tiles.map((x) => x.shape), ["bed", "car", "utensils", "ferris", "bag", "ellipsis"]);
  assert.deepEqual(tiles.filter((x) => x.chosen).map((x) => x.name), ["Mat"]);
  assert.deepEqual([sv.up.sheetKicker, sv.newExpense, sv.up.what, sv.up.whatExample, sv.up.saveExpense],
    ["Utlägg", "Nytt utlägg", "Beskrivning", "Till exempel: bensin", "Spara utlägg"]);
});

// REQ: MI-30 six categories for budget items and expenses, in a fixed order
test("MI-30 the categories", () => {
  assert.deepEqual(sv.budgetCategories, ["Boende", "Transport", "Mat", "Upplevelse", "Shopping", "Övrigt"]);
});

// REQ: MI-31 Mat/Fritid is converted once: an activity's expense gets the activity's category, the rest Mat; nothing else changes
test("MI-31 converting Mat/Fritid", async () => {
  const { applyOps, Trip, checkTrip } = await import("@trip/schema");
  const { recategorizeOps } = await import("../src/money.ts");
  const act = (id: string, category: string) => ({ id, text: id, placeIds: [], category });
  const ex = (id: string, category: string, activityId?: string) => ({ id, text: id, category, amount: 10, paidBy: "anna", sharedBy: [], ...(activityId ? { activityId } : {}) });
  const t = Trip.parse({ id: "t", revision: 1, title: "t", timezone: "UTC", stops: [], places: [], bookings: [], tasks: [], travelers: [{ id: "anna", name: "Anna", packing: [] }],
    days: [{ id: "d1", date: "2026-10-20", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00",
      activities: [act("museum", "Museum"), act("lunch", "Mat"), act("souvenir", "Shopping"), act("tag", "Resa")] }],
    budget: [{ id: "b1", category: "Mat/Fritid", amount: 3000, paid: false }, { id: "b2", category: "Boende", amount: 5000, paid: true }],
    expenses: [ex("e1", "Mat/Fritid", "museum"), ex("e2", "Mat/Fritid", "lunch"), ex("e3", "Mat/Fritid", "souvenir"), ex("e4", "Mat/Fritid"),
      ex("e5", "Mat/Fritid", "gone"), ex("e6", "Transport", "tag"), ex("e7", "Mat/Fritid", "tag")] });
  const ops = recategorizeOps(t);
  const after = Trip.parse(applyOps(t, ops));
  assert.deepEqual(checkTrip(after), checkTrip(t), "no new problems");
  assert.deepEqual(after.budget.map((b) => b.category), ["Mat", "Boende"]);
  assert.deepEqual(after.expenses.map((e) => e.category), ["Upplevelse", "Mat", "Shopping", "Mat", "Mat", "Transport", "Mat"],
    "an activity's category only for the experiences and shopping, never Transport or Övrigt for a former Mat/Fritid; a removed activity gives Mat");
  assert.deepEqual(recategorizeOps(after), [], "once: nothing left to convert");
});
