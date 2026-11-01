import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { saveActivity } from "../src/edit.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [{ id: "d1", date: "2026-10-24", title: "K", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00",
    activities: [{ id: "a", text: "Avfärd", note: "Mölndal ca 07.15", placeIds: [], start: "06:30", durationMin: 60, estimated: false, category: "Resa" }] }],
  places: [], bookings: [], tasks: [], travelers: [],
});
const save = (t: Trip, note: string | undefined) => {
  const r = saveActivity(t, "d1", { start: "06:30", estimated: false, text: "Avfärd", place: { kind: "none" }, category: "Resa", durationMin: 60, note }, "a");
  assert.ok(r.ok);
  return Trip.parse(applyOps(t, r.ok ? r.ops : [])).days[0].activities[0];
};

test("ED-19 an activity has a short title and an optional note", () => {
  assert.equal(trip().days[0].activities[0].note, "Mölndal ca 07.15");
  assert.equal(save(trip(), undefined).note, "Mölndal ca 07.15"); // undefined keeps
  assert.equal(save(trip(), "  Räkna med trafik ").note, "Räkna med trafik");
  assert.equal(save(trip(), "").note, undefined); // empty removes
});
