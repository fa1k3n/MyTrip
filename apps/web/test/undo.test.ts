import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { canUndo, undoOps, UNDOABLE } from "../src/undo.ts";
import { moveActivity } from "../src/schedule.ts";

const act = (id: string, start: string) => ({ id, text: id, placeIds: [], start, durationMin: 60, estimated: false, category: "Mat" });
const trip = () => Trip.parse({
  id: "t", revision: 3, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [{ id: "d1", date: "2026-10-26", title: "Berlin", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00", activities: [act("a", "09:00"), act("b", "11:00")] }],
  bookings: [{ id: "tix", name: "Zoo", from: "2026-10-26", to: "2026-10-26", status: "paid", files: [{ id: "f1234567890abcdef", name: "z.pdf", type: "application/pdf", size: 10 }] },
    { id: "hotel", name: "Hotell", from: "2026-10-26", to: "2026-10-26", status: "paid" }],
  places: [], tasks: [], travelers: [],
});

test("ED-22 Ångra puts back what a change altered", () => {
  const before = trip(), r = moveActivity(before, "d1", "a", "d1", 1);
  assert.ok(r.ok);
  const after = { ...Trip.parse(applyOps(before, r.ok ? r.ops : [])), revision: 4 };
  const back = Trip.parse(applyOps(after, undoOps(before, after)));
  assert.deepEqual({ ...back, revision: 3 }, before);
  assert.deepEqual(undoOps(before, after).map((o) => o.path), ["days"]); // only what changed
});

test("ED-22 Ångra is offered for moves, planned wishes and removals in Nåla", () => {
  for (const r of ["move activity", "plan wish", "remove activity", "remove booking", "remove budget", "remove task", "remove place", "remove info"]) assert.ok(UNDOABLE.has(r), r);
  assert.equal(UNDOABLE.has("task done"), false);
});

test("ED-22 Ångra is not offered when a change removed ticket files", () => {
  const before = trip();
  const noTix = Trip.parse(applyOps(before, [{ op: "remove", path: "bookings/0" }]));
  const noHotel = Trip.parse(applyOps(before, [{ op: "remove", path: "bookings/1" }]));
  assert.equal(canUndo(before, noTix), false);
  assert.equal(canUndo(before, noHotel), true);
});
