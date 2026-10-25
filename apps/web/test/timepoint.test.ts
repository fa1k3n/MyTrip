import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { ACTIVITY_CATEGORIES, CATEGORIES, TIME_POINT, categoryIcon, dayIcons } from "../src/categories.ts";
import { activityMissing, scheduleRows } from "../src/schedule.ts";
import { saveActivity } from "../src/edit.ts";
import { applyOps } from "@trip/schema/src/ops.ts";

// REQ: ED-20 Klockslag is an activity type with a clock icon, not a wish category
test("ED-20 Klockslag is offered for activities only", () => {
  assert.equal(TIME_POINT, "Klockslag");
  assert.ok(ACTIVITY_CATEGORIES.some((c) => c.name === TIME_POINT));
  assert.ok(!CATEGORIES.some((c) => (c.name as string) === TIME_POINT));
  assert.equal(categoryIcon(TIME_POINT), TIME_POINT);
});

// REQ: ED-20 a Klockslag does not count for the day's icons
test("ED-20 dayIcons skip Klockslag", () => {
  const day = (cats: string[]) => ({ activities: cats.map((category) => ({ category })), legs: [], icons: ["✨"] }) as never;
  assert.deepEqual(dayIcons(day([TIME_POINT, TIME_POINT, "Mat"])), ["Mat"]);
  assert.deepEqual(dayIcons(day([TIME_POINT])), ["✨"]);
});

// REQ: ED-20 a Klockslag needs a start but no duration, and is stored with its end at its start
test("ED-20 a Klockslag has no duration and zero length", () => {
  assert.equal(activityMissing({ start: "08:00", category: TIME_POINT }), null);
  const t = Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Stockholm", stops: [], places: [], bookings: [], tasks: [], travelers: [],
    days: [{ id: "d1", date: "2026-10-26", title: "D", summary: "S.", icons: ["🚗"], start: "07:00", end: "18:00",
      activities: [{ id: "frukost", text: "Frukost", placeIds: [], start: "07:00", durationMin: 30, category: "Mat" }] }] });
  const r = saveActivity(t, "d1", { start: "08:00", estimated: false, text: "Avresa", place: { kind: "none" }, category: TIME_POINT, durationMin: 60 });
  assert.ok(r.ok);
  const a = applyOps(t, r.ops).days[0].activities.find((x) => x.text === "Avresa")!;
  assert.deepEqual([a.start, a.end, a.durationMin], ["08:00", "08:00", undefined]);
  const rows = scheduleRows([...applyOps(t, r.ops).days[0].activities, { start: "08:00", durationMin: 60 }]);
  assert.deepEqual(rows.map((x) => x.kind), ["act", "gap", "act", "act"], "a gap before it, no clash after it");
});
