import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, categoryIcon, dayIcons } from "../src/categories.ts";

const act = (category?: string) => ({ category });
const leg = (vehicle: string, durationMin?: number) => ({ vehicle, durationMin });
const day = (activities: { category?: string }[], legs: { vehicle: string; durationMin?: number }[] = [], icons = ["✨"]) => ({ activities, legs, icons }) as never;

// REQ: DB-04 one shared list of categories; each category has its own icon
test("DB-04 categories and their icon ids", () => {
  assert.deepEqual(CATEGORIES.map((c) => c.name), ["Mat", "Utsikt", "Aktivitet", "Avkoppling", "Museum", "Bad", "Shopping", "Natur", "Resa"]);
  assert.equal(categoryIcon("Museum"), "Museum");
  assert.equal(categoryIcon("Okänd"), undefined);
});

// REQ: DC-14 the day shows the icons of its most common activity categories, ties in order of first appearance
test("DC-14 dayIcons from activity categories", () => {
  assert.deepEqual(dayIcons(day([act("Museum"), act("Utsikt"), act("Museum"), act("Mat")])), ["Museum", "Utsikt"]);
  assert.deepEqual(dayIcons(day([act("Mat"), act(), act("Utsikt")])), ["Mat", "Utsikt"]);
  assert.deepEqual(dayIcons(day([act("Bad")])), ["Bad"]);
});

// REQ: DC-14 a day with at least two hours of motorised travel starts with the vehicle that takes longest
test("DC-14 dayIcons on travel days", () => {
  assert.deepEqual(dayIcons(day([act("Mat"), act("Mat"), act("Utsikt")], [leg("car", 150), leg("ferry", 45), leg("car", 210)])), ["car", "Mat"]);
  assert.deepEqual(dayIcons(day([], [leg("car", 180), leg("ferry", 360)])), ["ferry"]);
  assert.deepEqual(dayIcons(day([act("Mat")], [leg("car", 30)])), ["Mat"]); // short drives do not count
});

// REQ: DC-14 without categories or travel the day's own icons are used
test("DC-14 dayIcons falls back to the day's own icons", () => {
  assert.deepEqual(dayIcons(day([act(), act("Okänd")], [], ["🦕", "🛍️"])), ["🦕", "🛍️"]);
});
