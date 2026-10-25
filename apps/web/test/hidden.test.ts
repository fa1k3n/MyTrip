import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, checkTrip, Trip } from "@trip/schema";
import { saveActivity } from "../src/edit.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "t", timezone: "Europe/Berlin", stops: [], places: [], bookings: [], tasks: [], travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00",
    activities: [{ id: "spa", text: "Spa", placeIds: [], start: "15:00", hiddenFrom: ["anna"] }] }],
});
const input = { start: "15:00", estimated: false, text: "Spa", place: { kind: "none" as const } };
const run = (r: ReturnType<typeof saveActivity>) => Trip.parse(applyOps(trip(), r.ok ? r.ops : []));

// REQ: AU-18 the activity form chooses whom to hide it from; an empty choice shows it to all, leaving the choice out keeps it
test("AU-18 saveActivity sets, clears and keeps hiddenFrom", () => {
  assert.deepEqual(run(saveActivity(trip(), "d1", { ...input, text: "Ny", hiddenFrom: ["anna", "bo"] })).days[0].activities.find((a) => a.text === "Ny")!.hiddenFrom, ["anna", "bo"]);
  assert.equal(run(saveActivity(trip(), "d1", { ...input, hiddenFrom: [] }, "spa")).days[0].activities[0].hiddenFrom, undefined);
  assert.deepEqual(run(saveActivity(trip(), "d1", input, "spa")).days[0].activities[0].hiddenFrom, ["anna"]);
});

// REQ: AU-18 an activity may only be hidden from travelers of the trip
test("AU-18 checkTrip reports hiding from an unknown traveler", () => {
  const t = trip();
  t.days[0].activities[0].hiddenFrom = ["okand"];
  assert.ok(checkTrip(t).some((m) => m.includes("unknown traveler okand")));
});
