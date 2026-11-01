import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, checkTrip, Trip } from "@trip/schema";
import { planWish } from "../src/schedule.ts";
import { byVotes, plannedWishes } from "../src/wishes.ts";

const act = (id: string, start: string | undefined, durationMin?: number) => ({ id, text: id, placeIds: [], start, durationMin, estimated: false, category: "Mat" });
const day = (id: string, date: string, start: string, activities: ReturnType<typeof act>[]) =>
  ({ id, date, title: id, summary: "S.", icons: ["🚗"], start, end: "18:00", activities });
const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [
    day("d1", "2026-10-24", "09:00", [act("a", "09:00", 60), act("b", "10:00", 120), act("c", "14:00", 60)]),
    day("d2", "2026-10-25", "09:00", [act("x", "10:00", 30)]),
    day("d3", "2026-10-26", "08:30", []),
    ],
  dreams: [
    { id: "zoo", title: "Zoo Berlin", category: "Upplevelse", source: "Egen", icon: "✨", votes: 2 },
    { id: "glass", title: "Glass", category: "Mat", source: "Egen", icon: "✨", votes: 0 },
    { id: "dold", title: "Dold", category: "Mat", source: "", icon: "✨", votes: 0, hidden: true },
  ],
  places: [], bookings: [], tasks: [], travelers: [],
});
const planned = (t: Trip, dreamId: string, dayId: string, index?: number) => {
  const r = planWish(t, dreamId, dayId, index);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return Trip.parse(applyOps(t, r.ok ? r.ops : []));
};
const times = (t: Trip, d: string) => t.days.find((x) => x.id === d)!.activities.map((a) => `${a.id} ${a.start}`);

test("DB-17 a dropped wish becomes an activity with the wish's title and category, linked to it, without place or duration", () => {
  const t = planned(trip(), "zoo", "d1", 3);
  const a = t.days[0].activities[3];
  assert.equal(a.text, "Zoo Berlin");
  assert.equal(a.category, "Upplevelse");
  assert.equal(a.dreamId, "zoo");
  assert.deepEqual(a.placeIds, []);
  assert.equal(a.durationMin, undefined);
  assert.equal(a.end, undefined);
  assert.equal(a.estimated, true);
  assert.deepEqual(checkTrip(t), []);
});

test("DB-17 a dropped wish starts when the activity before it ends", () => {
  assert.deepEqual(times(planned(trip(), "zoo", "d1", 3), "d1"), ["a 09:00", "b 10:00", "c 14:00", "zoo-berlin 15:00"]);
  assert.deepEqual(times(planned(trip(), "zoo", "d1", 2), "d1"), ["a 09:00", "b 10:00", "zoo-berlin 12:00", "c 14:00"]);
});

test("DB-17 a wish dropped first ends an hour later, when the next activity starts", () => {
  assert.deepEqual(times(planned(trip(), "zoo", "d2", 0), "d2"), ["zoo-berlin 09:00", "x 10:00"]);
});

test("DB-17 on an empty day a wish starts at the day's start", () => {
  assert.deepEqual(times(planned(trip(), "zoo", "d3", 0), "d3"), ["zoo-berlin 08:30"]);
});

test("DB-17 without a position the wish lands last; after an activity without duration it starts an hour later", () => {
  const t = planned(trip(), "glass", "d1");
  assert.deepEqual(times(t, "d1").at(-1), "glass-2 15:00");
  assert.deepEqual(times(planned(t, "zoo", "d1"), "d1").at(-1), "zoo-berlin 16:00");
});

test("DB-17 a wish can be planned again, on the same day and on others", () => {
  let t = planned(trip(), "zoo", "d1");
  t = planned(t, "zoo", "d1");
  t = planned(t, "zoo", "d2");
  const ids = t.days.flatMap((d) => d.activities.filter((a) => a.dreamId === "zoo").map((a) => a.id));
  assert.deepEqual(ids, ["zoo-berlin", "zoo-berlin-2", "zoo-berlin-3"]);
  assert.deepEqual(checkTrip(t), []);
});

test("DB-17 an unknown wish or day, or a hidden wish, cannot be planned", () => {
  assert.equal(planWish(trip(), "nope", "d1").ok, false);
  assert.equal(planWish(trip(), "zoo", "nope").ok, false);
  assert.equal(planWish(trip(), "dold", "d1").ok, false); // AU-30
});

test("DB-19 a wish is planned when an activity the viewer sees is linked to it", () => {
  const t = trip();
  assert.deepEqual([...plannedWishes(t)], []);
  const p = planned(t, "zoo", "d2");
  assert.deepEqual([...plannedWishes(p)], ["zoo"]);
  const hidden = Trip.parse({ ...p, days: p.days.map((d) => ({ ...d, activities: d.activities.map((a) => (a.dreamId ? { ...a, hidden: true } : a)) })) });
  assert.deepEqual([...plannedWishes(hidden)], []); // AU-18: hidden from the viewer
});

test("DB-16 Nåla lists the wishes the most voted first, ties in Önska's order", () => {
  const list = [{ id: "a", votes: 1 }, { id: "b", votes: 3 }, { id: "c", votes: 1 }, { id: "d", votes: 0 }, { id: "e", votes: 3 }];
  assert.deepEqual(byVotes(list).map((w) => w.id), ["b", "e", "a", "c", "d"]);
  assert.deepEqual(list.map((w) => w.id), ["a", "b", "c", "d", "e"]); // Önska's own order is untouched
});
