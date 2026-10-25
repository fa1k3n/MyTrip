import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, checkTrip, Trip } from "@trip/schema";
import { daysOutside, setTripDates, tripRange } from "../src/edit.ts";
import { editModeLabel } from "../src/format.ts";
import { sv } from "../src/sv.ts";

const day = (id: string, date: string) => ({ id, date, title: `Dag ${date}`, summary: "Planerat.", icons: ["🚗"], start: "09:00", end: "18:00", activities: [] });
const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin",
  stops: [{ label: "Köpenhamn", sub: "24 lör", dayId: "d1" }, { label: "Berlin", sub: "25 sön", dayId: "d2" }],
  days: [day("d1", "2026-10-24"), day("d2", "2026-10-25")],
  places: [], bookings: [], tasks: [], travelers: [],
});
const apply = (t: Trip, from: string, to: string) => {
  const r = setTripDates(t, { from, to });
  assert.ok(r.ok, r.ok ? "" : r.error);
  return Trip.parse(applyOps(t, r.ok ? r.ops : []));
};

test("ED-14 the trip's dates are its first and last day, or none", () => {
  assert.deepEqual(tripRange(trip()), { from: "2026-10-24", to: "2026-10-25" });
  assert.equal(tripRange({ ...trip(), days: [] }), null);
});

test("ED-14 extending the dates adds an empty day with a stop for each new date and keeps the old days", () => {
  const t = apply(trip(), "2026-10-23", "2026-10-27");
  assert.deepEqual(t.days.map((d) => d.date).sort(), ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  assert.equal(t.days.find((d) => d.id === "d1")!.title, "Dag 2026-10-24");
  const added = t.days.find((d) => d.date === "2026-10-26")!;
  assert.equal(added.title, sv.newDay);
  assert.equal(added.activities.length, 0);
  assert.ok(t.stops.some((s) => s.dayId === added.id && s.sub === "26 mån"));
  assert.deepEqual(checkTrip(t), []);
});

test("ED-14 shortening the dates removes the days outside and their stops", () => {
  const t = trip();
  assert.deepEqual(daysOutside(t, "2026-10-25", "2026-10-25").map((d) => d.id), ["d1"]);
  const n = apply(t, "2026-10-25", "2026-10-25");
  assert.deepEqual(n.days.map((d) => d.id), ["d2"]);
  assert.deepEqual(n.stops.map((s) => s.dayId), ["d2"]);
});

test("ED-14 a trip without days gets its first days from the dates", () => {
  const t = apply({ ...trip(), days: [], stops: [] }, "2026-07-01", "2026-07-03");
  assert.equal(t.days.length, 3);
  assert.equal(new Set(t.days.map((d) => d.id)).size, 3);
});

test("ED-14 the dates must be valid, in order and at most 60 days", () => {
  const t = trip();
  assert.deepEqual(setTripDates(t, { from: "", to: "2026-10-25" }), { ok: false, error: sv.errors.dates });
  assert.deepEqual(setTripDates(t, { from: "2026-10-25", to: "2026-10-24" }), { ok: false, error: sv.errors.toBeforeFrom });
  assert.deepEqual(setTripDates(t, { from: "2026-01-01", to: "2026-03-15" }), { ok: false, error: sv.errors.tooLong });
});

test("ED-14 unchanged dates give no changes", () => {
  const r = setTripDates(trip(), { from: "2026-10-24", to: "2026-10-25" });
  assert.deepEqual(r, { ok: true, ops: [] });
});

test("ED-13 the edit mode button names what it does", () => {
  assert.equal(editModeLabel(false), sv.editModeOn);
  assert.equal(editModeLabel(true), sv.editModeOff);
});
