import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, checkTrip, Trip } from "@trip/schema";
import { saveActivity, wishByDefault } from "../src/edit.ts";
import { defaultDuration, suggestStart } from "../src/schedule.ts";
import { addChoices } from "../src/upday.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [{ id: "day-1", date: "2026-10-24", title: "Köpenhamn", summary: "Staden.", icons: ["🚶"], start: "09:00", end: "18:00", location: "Köpenhamn", weather: { lat: 55.68, lon: 12.57 }, legs: [],
    activities: [{ id: "a-1", text: "Lunch", placeIds: [], start: "12:00", estimated: true, durationMin: 50 }] }],
  places: [], bookings: [], tasks: [], travelers: [{ id: "anna", name: "Anna", packing: [], packed: [] }], budget: [],
  dreams: [{ id: "zoo", title: "Zoo", category: "Aktivitet", source: "manuell", icon: "✨", votes: 0 }],
});
const place = { kind: "none" as const };

// REQ: ED-28 a new activity starts when the day's last one ends, at the next quarter hour, else at 10.00
test("ED-28 suggestStart", () => {
  assert.equal(suggestStart([]), "10:00");
  assert.equal(suggestStart([{ start: "12:00", durationMin: 50 }]), "13:00", "12.50 rounded up");
  assert.equal(suggestStart([{ start: "12:00", durationMin: 45 }]), "12:45", "already on a quarter");
  assert.equal(suggestStart([{ start: "09:00", end: "11:10" }, { start: "14:00" }]), "15:00", "the last without a duration takes an hour");
  assert.equal(suggestStart([{ start: "23:30", durationMin: 60 }]), "23:45", "never past the day");
  assert.equal(suggestStart([{}]), "10:00", "no times at all");
});

// REQ: ED-28 the duration follows the category, and a Klockslag has none
test("ED-28 defaultDuration", () => {
  assert.equal(defaultDuration("Mat"), 60);
  assert.equal(defaultDuration("Museum"), 120);
  assert.equal(defaultDuration("Klockslag"), undefined);
  assert.equal(defaultDuration(""), undefined);
  for (const c of ["Mat", "Utsikt", "Aktivitet", "Avkoppling", "Museum", "Bad", "Shopping", "Natur", "Resa"]) assert.ok(defaultDuration(c), c);
});

// REQ: ED-29 a new activity makes a wish with its title and category and is linked to it, in one change
test("ED-29 saveActivity with a new wish", () => {
  const t = trip();
  const r = saveActivity(t, "day-1", { start: "14:00", estimated: true, text: "Glass vid Nyhavn", place, category: "Mat", durationMin: 30, newWish: true });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const next = Trip.parse(applyOps(t, r.ops));
  assert.deepEqual(checkTrip(next), []);
  const w = next.dreams.find((x) => x.title === "Glass vid Nyhavn")!;
  assert.equal(w.category, "Mat");
  assert.equal(next.days[0]!.activities.find((a) => a.text === "Glass vid Nyhavn")!.dreamId, w.id);
  assert.notEqual(w.id, next.days[0]!.activities.find((a) => a.text === "Glass vid Nyhavn")!.id, "the wish and the activity have their own ids");
  const linked = saveActivity(t, "day-1", { start: "14:00", estimated: true, text: "Zoo", place, category: "Aktivitet", durationMin: 120, dreamId: "zoo", newWish: true });
  assert.ok(linked.ok && Trip.parse(applyOps(t, linked.ops)).dreams.length === 1, "a chosen wish wins");
});

// REQ: ED-29 "Ny önskan" is the default except for Klockslag, Resa, a hidden activity and a role that may not change wishes
test("ED-29 wishByDefault", () => {
  assert.equal(wishByDefault("Mat", [], true), true);
  assert.equal(wishByDefault("", [], true), true, "before a category is chosen");
  assert.equal(wishByDefault("Klockslag", [], true), false);
  assert.equal(wishByDefault("Resa", [], true), false);
  assert.equal(wishByDefault("Mat", ["anna"], true), false);
  assert.equal(wishByDefault("Mat", [], false), false);
});

// REQ: UP-51 the floating button adds what the role may add; both give a choice
test("UP-51 addChoices", () => {
  assert.deepEqual(addChoices(true, true), ["activity", "expense"]);
  assert.deepEqual(addChoices(true, false), ["expense"]);
  assert.deepEqual(addChoices(false, true), ["activity"]);
  assert.deepEqual(addChoices(false, false), []);
});
