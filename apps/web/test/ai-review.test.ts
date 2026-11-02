import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { applyOps } from "@trip/schema/src/ops.ts";
import { aiCounts, keepAi, keepAllAi, removeAi, removeDayAi } from "../src/aiReview.ts";
import { UNDOABLE } from "../src/undo.ts";

const act = (id: string, extra: object = {}) => ({ id, text: id, placeIds: [], estimated: true, start: "10:00", durationMin: 60, ...extra });
const trip = () => Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], travelers: [],
  places: [{ id: "p-zoo", name: "Zoo", address: "Gata 1" }, { id: "p-hotel", name: "Hotell", address: "Gata 2" }],
  bookings: [{ id: "b1", name: "Hotell", from: "2027-10-25", to: "2027-10-26", status: "tobook", ai: true, placeId: "p-hotel" }],
  tasks: [{ id: "k1", text: "Dekal", done: false, ai: true }, { id: "k2", text: "Pass", done: false }],
  dreams: [{ id: "w-zoo", title: "Zoo", category: "Aktivitet", source: "AI-hjälpen", icon: "✨", votes: 0, ai: true },
    { id: "w-own", title: "Glass", category: "Mat", source: "Manuellt", icon: "✨", votes: 2 }],
  days: [{ id: "d0", date: "2027-10-25", title: "A", summary: "S.", icons: ["car"], start: "09:00", end: "18:00", legs: [], activities: [act("mine")] },
    { id: "d1", date: "2027-10-26", title: "B", summary: "S.", icons: ["Resa"], start: "09:00", end: "18:00", legs: [],
      activities: [act("a-zoo", { ai: true, dreamId: "w-zoo", placeIds: ["p-zoo"] }), act("a-boat", { ai: true }), act("own", { dreamId: "w-own" })] }] });

// REQ: AI-84 the counts of items still marked as AI, and the days that have AI activities
test("AI-84 aiCounts", () => {
  assert.deepEqual(aiCounts(trip()), { activities: 2, tasks: 1, bookings: 1, wishes: 1, days: ["d1"] });
});

// REQ: AI-83 keeping an item takes its AI mark away; AI-84 Behåll allt confirms every one
test("AI-83 AI-84 keep", () => {
  const one = applyOps(trip(), keepAi(trip(), { kind: "activity", dayId: "d1", id: "a-boat" }));
  assert.equal(one.days[1]!.activities[1]!.ai, undefined);
  assert.equal(one.days[1]!.activities[0]!.ai, true);
  const zoo = applyOps(trip(), keepAi(trip(), { kind: "activity", dayId: "d1", id: "a-zoo" }));
  assert.equal(zoo.dreams[0]!.ai, undefined, "keeping an activity keeps its AI wish");
  const wish = applyOps(trip(), keepAi(trip(), { kind: "wish", id: "w-zoo" }));
  assert.equal(wish.days[1]!.activities[0]!.ai, undefined, "keeping a wish keeps its AI activities");
  const all = applyOps(trip(), keepAllAi(trip()));
  assert.deepEqual(aiCounts(all), { activities: 0, tasks: 0, bookings: 0, wishes: 0, days: [] });
  assert.equal(all.tasks[0]!.text, "Dekal");
});

// REQ: AI-83 removing an AI activity takes its AI wish and its unused place too; removing an AI wish takes its activities
test("AI-83 remove", () => {
  const t = applyOps(trip(), removeAi(trip(), { kind: "activity", dayId: "d1", id: "a-zoo" }));
  assert.deepEqual(t.days[1]!.activities.map((a) => a.id), ["a-boat", "own"]);
  assert.deepEqual(t.dreams.map((w) => w.id), ["w-own"], "the AI wish goes, the own wish stays");
  assert.deepEqual(t.places.map((p) => p.id), ["p-hotel"], "the unused place goes, the hotel's stays");
  const w = applyOps(trip(), removeAi(trip(), { kind: "wish", id: "w-zoo" }));
  assert.deepEqual(w.days[1]!.activities.map((a) => a.id), ["a-boat", "own"]);
  assert.deepEqual(applyOps(trip(), removeAi(trip(), { kind: "task", id: "k1" })).tasks.map((k) => k.id), ["k2"]);
  assert.deepEqual(applyOps(trip(), removeAi(trip(), { kind: "booking", id: "b1" })).bookings, []);
  assert.ok(UNDOABLE.has("remove ai") && UNDOABLE.has("keep ai"), "with Ångra");
});

// REQ: AI-85 removing a day's AI activities
test("AI-85 removeDayAi", () => {
  const t = applyOps(trip(), removeDayAi(trip(), "d1"));
  assert.deepEqual(t.days[1]!.activities.map((a) => a.id), ["own"]);
  assert.deepEqual(t.dreams.map((w) => w.id), ["w-own"]);
  assert.deepEqual(t.days[0]!.activities.map((a) => a.id), ["mine"]);
});
