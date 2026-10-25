import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { activityEnd, activityMissing, moveActivity, scheduleRows } from "../src/schedule.ts";
import { saveActivity } from "../src/edit.ts";
import { activityTime } from "../src/format.ts";
import { sv } from "../src/sv.ts";

const act = (id: string, start: string | undefined, durationMin?: number) => ({ id, text: id, placeIds: [], start, durationMin, estimated: false, category: "Mat" });
const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [
    { id: "d1", date: "2026-10-24", title: "Köpenhamn", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00",
      activities: [act("a", "09:00", 60), act("b", "10:00", 120), act("c", "14:00", 60)] },
    { id: "d2", date: "2026-10-25", title: "Berlin", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00",
      activities: [act("x", "10:00", 30)] },
  ],
  places: [], bookings: [], tasks: [], travelers: [],
});
const moved = (t: Trip, ...args: Parameters<typeof moveActivity> extends [Trip, ...infer R] ? R : never) => {
  const r = moveActivity(t, ...args);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return Trip.parse(applyOps(t, r.ok ? r.ops : []));
};
const times = (t: Trip, day: string) => t.days.find((d) => d.id === day)!.activities.map((a) => `${a.id} ${a.start}`);

test("DM-13 an activity keeps an optional duration in minutes", () => {
  const t = trip();
  assert.equal(t.days[0].activities[0].durationMin, 60);
  assert.equal(Trip.parse({ ...t, days: [{ ...t.days[0], activities: [act("y", "09:00")] }] }).days[0].activities[0].durationMin, undefined);
});

test("ED-15 saveActivity stores the estimated duration", () => {
  const t = trip();
  const r = saveActivity(t, "d1", { start: "16:00", estimated: true, text: "Fika", place: { kind: "none" }, category: "Mat", durationMin: 45 });
  assert.ok(r.ok);
  const n = Trip.parse(applyOps(t, r.ok ? r.ops : []));
  assert.equal(n.days[0].activities.find((a) => a.text === "Fika")!.durationMin, 45);
});

test("ED-15 the activity form needs a time, an estimated duration and a category", () => {
  const ok = { start: "09:00", durationMin: 30, category: "Resa" };
  assert.equal(activityMissing(ok), null);
  assert.equal(activityMissing({ ...ok, start: "" }), sv.errors.activityStart);
  assert.equal(activityMissing({ ...ok, durationMin: undefined }), sv.errors.duration);
  assert.equal(activityMissing({ ...ok, category: "" }), sv.errors.category);
});

test("TM-05 an activity shows only its start; the next start shows when it ends", () => {
  const a = { start: "09:00", durationMin: 90, estimated: true };
  assert.equal(activityTime(a), "ca 09.00");
  assert.equal(activityEnd(a), "10:30"); // still used for gaps and clashes
  assert.equal(activityEnd({ start: "23:30", durationMin: 60 }), "24:00"); // capped at midnight
  assert.equal(activityEnd({ start: "09:00", end: "11:15", durationMin: 30 }), "11:15"); // a fixed end wins
});

test("ED-17 gaps of 30 minutes or more and overlaps are marked between activities", () => {
  const rows = scheduleRows([act("a", "09:00", 60), act("b", "10:00", 120), act("c", "11:30", 60), act("d", "13:30", 30), act("e", undefined, 30)]);
  assert.deepEqual(rows.map((r) => (r.kind === "act" ? r.a.id : `${r.kind} ${r.min}`)), ["a", "b", "clash 30", "c", "gap 60", "d", "e"]);
  assert.deepEqual(scheduleRows([act("a", "09:00", 60), act("b", "10:20", 60)]).map((r) => r.kind), ["act", "act"]); // 20 min is a buffer, not a gap
  assert.deepEqual(scheduleRows([act("a", "09:00"), act("b", "09:30", 60)]).map((r) => r.kind), ["act", "act"]); // unknown end: nothing to mark
});

test("ED-16 moving an activity down puts it right after its new predecessor and keeps its duration", () => {
  const t = moved(trip(), "d1", "a", "d1", 2);
  assert.deepEqual(times(t, "d1"), ["b 10:00", "c 14:00", "a 15:00"]);
  const a = t.days[0].activities[2];
  assert.equal(a.durationMin, 60);
  assert.equal(a.estimated, true);
});

test("ED-16 moving an activity to the top makes it end when the next one starts", () => {
  assert.deepEqual(times(moved(trip(), "d1", "c", "d1", 0), "d1"), ["c 08:00", "a 09:00", "b 10:00"]);
});

test("ED-16 an activity can move to another day", () => {
  const t = moved(trip(), "d1", "b", "d2", 1);
  assert.deepEqual(times(t, "d1"), ["a 09:00", "c 14:00"]);
  assert.deepEqual(times(t, "d2"), ["x 10:00", "b 10:30"]);
});

test("ED-16 a move to an unknown day or activity fails", () => {
  assert.equal(moveActivity(trip(), "d1", "nope", "d1", 0).ok, false);
  assert.equal(moveActivity(trip(), "d1", "a", "nope", 0).ok, false);
});

test("ED-16 after an activity without a duration, a moved activity starts an hour later", () => {
  const t = trip();
  t.days[0].activities[0].durationMin = undefined;
  assert.deepEqual(times(moved(t, "d1", "c", "d1", 1), "d1"), ["a 09:00", "c 10:00", "b 10:00"]);
});

test("ED-15 a duration from the form replaces an old fixed end", () => {
  const t = trip();
  t.days[0].activities[0].end = "09:30";
  const r = saveActivity(t, "d1", { start: "09:00", estimated: true, text: "a", place: { kind: "none" }, category: "Mat", durationMin: 180 }, "a");
  assert.ok(r.ok);
  const a = Trip.parse(applyOps(t, r.ok ? r.ops : [])).days[0].activities.find((x) => x.id === "a")!;
  assert.equal(a.end, undefined);
  assert.equal(activityEnd(a), "12:00");
});
