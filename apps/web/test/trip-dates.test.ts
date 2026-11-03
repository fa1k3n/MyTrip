import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, checkTrip, Trip } from "@trip/schema";
import { datesForm, datesMode, daysOutside, movedTo, removedDays, setTripDates, tripRange } from "../src/edit.ts";
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

const moved = (t: Trip, from: string, to: string) => {
  const r = setTripDates(t, { from, to }, "move");
  assert.ok(r.ok, r.ok ? "" : r.error);
  return Trip.parse(applyOps(t, r.ok ? r.ops : []));
};
const planned = () => Trip.parse({
  ...trip(),
  stops: [...trip().stops, { label: "Hotell", sub: "Nära vattnet", dayId: "d2" }],
  days: [{ ...day("d1", "2026-10-24"), legs: [{ vehicle: "train", origin: "Gatwick", destination: "Brighton", durationMin: 35 }] },
    { ...day("d2", "2026-10-25"), activities: [{ id: "a1", text: "Piren", start: "10:00" }] }],
  tasks: [{ id: "k1", text: "Ansök om ETA", done: false, due: "2026-10-20" }, { id: "k2", text: "Packa", done: false }],
});

test("ED-30 the choice is offered when the first date changes; moving is chosen when the dates do not overlap", () => {
  const t = trip();
  assert.equal(datesMode(t, "2026-11-04", "2026-11-06"), "move");
  assert.equal(datesMode(t, "2026-10-25", "2026-10-27"), "length");
  assert.equal(datesMode(t, "2026-10-23", "2026-10-25"), "length");
  assert.equal(datesMode(t, "2026-10-24", "2026-10-30"), null, "only the last date changes");
  assert.equal(datesMode({ ...t, days: [] }, "2026-11-04", "2026-11-06"), null, "a trip without days");
  assert.equal(datesMode(t, "", "2026-11-06"), null);
});

test("ED-30 moving the trip keeps the days in order with their plan and adds empty days at the end", () => {
  const t = moved(planned(), "2026-11-04", "2026-11-06");
  const byDate = [...t.days].sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(byDate.map((d) => [d.id, d.date]).slice(0, 2), [["d1", "2026-11-04"], ["d2", "2026-11-05"]]);
  assert.equal(byDate[0]!.legs[0]!.destination, "Brighton");
  assert.equal(byDate[1]!.activities[0]!.text, "Piren");
  assert.equal(byDate[2]!.title, sv.newDay);
  assert.deepEqual(t.stops.filter((s) => s.dayId !== byDate[2]!.id).map((s) => [s.label, s.sub]),
    [["Köpenhamn", "4 ons"], ["Berlin", "5 tor"], ["Hotell", "Nära vattnet"]], "a date on a stop follows its day, other text stays");
  assert.deepEqual(checkTrip(t), []);
});

test("ED-30 moving the trip to fewer days removes the last days, and only those are listed", () => {
  const t = planned();
  assert.deepEqual(removedDays(t, { from: "2026-11-04", to: "2026-11-04" }, "move").map((d) => d.id), ["d2"]);
  assert.deepEqual(removedDays(t, { from: "2026-11-04", to: "2026-11-04" }, "length").map((d) => d.id), ["d1", "d2"]);
  const n = moved(t, "2026-11-04", "2026-11-04");
  assert.deepEqual(n.days.map((d) => [d.id, d.date]), [["d1", "2026-11-04"]]);
  assert.deepEqual(n.stops.map((s) => s.dayId), ["d1"]);
});

test("ED-30 changing the length works as before", () => {
  const t = planned();
  assert.deepEqual(setTripDates(t, { from: "2026-10-23", to: "2026-10-26" }, "length"), setTripDates(t, { from: "2026-10-23", to: "2026-10-26" }));
});

test("TK-11 moving the trip moves the tasks' due dates by as many days; changing the length does not", () => {
  const t = moved(planned(), "2026-11-04", "2026-11-05");
  assert.deepEqual(t.tasks.map((k) => k.due), ["2026-10-31", undefined]);
  const l = apply(planned(), "2026-10-23", "2026-10-25");
  assert.equal(l.tasks[0]!.due, "2026-10-20");
});

test("ED-31 moving the trip keeps its number of days from the new first date", () => {
  assert.equal(movedTo(trip(), "2026-11-04"), "2026-11-05");
  assert.equal(movedTo({ ...trip(), days: [] }, "2026-11-04"), null);
  assert.equal(movedTo(trip(), ""), null);
});

test("ED-31 the last date follows the first while Flytta resan is chosen, until the user changes it", () => {
  const t = trip(); // 24–25 Oct
  assert.deepEqual(datesForm(t, "2026-11-04", "2026-10-25", null, false), { to: "2026-11-05", mode: "move", offered: true });
  assert.deepEqual(datesForm(t, "2026-10-25", "2026-10-25", null, false), { to: "2026-10-25", mode: "length", offered: true }, "a moved trip that overlaps: length first");
  assert.deepEqual(datesForm(t, "2026-10-25", "2026-10-25", "move", false), { to: "2026-10-26", mode: "move", offered: true });
  assert.deepEqual(datesForm(t, "2026-11-04", "2026-10-25", "length", false), { to: "2026-10-25", mode: "length", offered: true });
  assert.deepEqual(datesForm(t, "2026-11-04", "2026-11-10", null, true), { to: "2026-11-10", mode: "move", offered: true }, "a last date typed by the user stays");
  assert.deepEqual(datesForm(t, "2026-10-24", "2026-10-30", null, true), { to: "2026-10-30", mode: "length", offered: false });
  assert.deepEqual(datesForm({ ...t, days: [] }, "2026-07-01", "2026-07-03", null, true), { to: "2026-07-03", mode: "length", offered: false });
});

const booked = (status: "tobook" | "ready" | "paid" | "cancelled") => Trip.parse({
  ...planned(), bookings: [{ id: "hotell", name: "Hotell Göteborg", kind: "stay", from: "2026-10-24", to: "2026-10-25", status }],
});

test("ED-32 Flytta resan moves a booking still to be booked by as many days", () => {
  const t = moved(booked("tobook"), "2026-11-04", "2026-11-05");
  assert.deepEqual([t.bookings[0]!.from, t.bookings[0]!.to], ["2026-11-04", "2026-11-05"]);
  assert.deepEqual(checkTrip(t), []);
});

test("ED-32 a booked or paid booking left outside the new dates stops the change with its name and dates; a cancelled one does not", () => {
  for (const status of ["ready", "paid"] as const) {
    const r = setTripDates(booked(status), { from: "2026-11-04", to: "2026-11-05" }, "move");
    assert.deepEqual(r, { ok: false, error: sv.errors.bookingsOutside("Hotell Göteborg 24–25 okt") });
  }
  const length = setTripDates(booked("paid"), { from: "2026-10-25", to: "2026-10-26" }, "length");
  assert.equal(length.ok, false);
  assert.ok(moved(booked("cancelled"), "2026-11-04", "2026-11-05"));
});

test("ED-32 a booking still to be booked that a shorter moved trip leaves outside also stops the change", () => {
  const t = Trip.parse({ ...booked("tobook"), bookings: [{ id: "hotell", name: "Hotell Göteborg", kind: "stay", from: "2026-10-25", to: "2026-10-25", status: "tobook" }] });
  assert.deepEqual(setTripDates(t, { from: "2026-11-04", to: "2026-11-04" }, "move"), { ok: false, error: sv.errors.bookingsOutside("Hotell Göteborg 25 okt") });
});
