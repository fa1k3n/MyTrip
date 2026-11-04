import { test } from "node:test";
import assert from "node:assert/strict";
import { tripFindings } from "../src/tripCheck.ts";

const act = (id: string, start: string, extra: object = {}) => ({ id, text: id, start, estimated: false, placeIds: [], ...extra });
const day = (id: string, date: string, acts: object[]) => ({ id, date, start: "08:00", end: "20:00", activities: acts, legs: [] });

// REQ: DQ-14 the serious findings come first, each level keeping the order of the days
test("DQ-14 findings come serious first, in day order within a level", () => {
  const t = { days: [
    day("d1", "2027-11-01", [act("A", "10:00", { durationMin: 60 }), act("B", "11:05", { durationMin: 30 })]), // 5 min buffer: caution
    day("d2", "2027-11-02", [act("C", "10:00", { durationMin: 60 }), act("D", "10:30")]), // overlap: warn
    day("d3", "2027-11-03", [act("E", "10:00", { durationMin: 60 }), act("F", "11:05", { durationMin: 30 })]), // caution
  ], bookings: [{ id: "h", name: "Hotell", from: "2027-11-01", to: "2027-11-04", status: "ready", kind: "stay" }] } as never;
  const f = tripFindings(t);
  assert.deepEqual(f.map((x) => x.level), ["warn", "caution", "caution"]);
  assert.deepEqual(f.map((x) => x.dayId), ["d2", "d1", "d3"]);
});
