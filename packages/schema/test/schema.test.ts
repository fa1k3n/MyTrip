import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "../src/schema.ts";
import { checkTrip } from "../src/check.ts";

const minimal = {
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin",
  stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [],
};

// REQ: MT-01 a trip has an id, a purpose and an optional cover image; lists default to empty
test("MT-01 Trip accepts the hub fields and defaults dreams and budget", () => {
  const t = Trip.parse({ ...minimal, purpose: "Höstlov", image: "berlin.jpg", imageAlt: "Familjen vid hamnen" });
  assert.equal(t.purpose, "Höstlov");
  assert.deepEqual(t.dreams, []);
  assert.deepEqual(t.budget, []);
  assert.equal(t.currency, "SEK");
});

// REQ: MT-01 the cover image is a plain file name, never a path
test("MT-01 Trip rejects an image name with a path", () => {
  assert.throws(() => Trip.parse({ ...minimal, image: "../secret.jpg" }));
});

// REQ: DM-05 TM-06 a day has legs and separate estimated flags for start and end
test("DM-05 TM-06 Day accepts legs and per-end estimates", () => {
  const t = Trip.parse({
    ...minimal,
    days: [{ id: "d1", date: "2026-10-25", title: "x", summary: "y", icons: ["🚗"], start: "08:30", end: "17:00", endEstimated: true, location: "Berlin",
      legs: [{ vehicle: "car", origin: "Köpenhamn", destination: "Berlin", departure: "08:30", durationMin: 420, waypoints: ["Rødby"] }], activities: [] }],
  });
  assert.equal(t.days[0].endEstimated, true);
  assert.equal(t.days[0].legs[0].vehicle, "car");
});

// REQ: DB-01 BG-02 dreams and budget items are validated
test("DB-01 BG-02 dreams and budget items are validated", () => {
  const t = Trip.parse({
    ...minimal,
    dreams: [{ id: "tv", title: "Fernsehturm", category: "Utsikt", source: "Från Claude", icon: "🗼", votes: 3 }],
    budget: [{ id: "b1", category: "Boende", amount: 5200, paid: true, owner: "Anna" }],
  });
  assert.equal(t.dreams[0].votes, 3);
  assert.throws(() => Trip.parse({ ...minimal, dreams: [{ ...t.dreams[0], votes: -1 }] }));
  assert.throws(() => Trip.parse({ ...minimal, budget: [{ id: "b1", category: "Boende", amount: -5, paid: true }] }));
});

// REQ: DM-09 duplicate ids among dreams and budget items are reported
test("DM-09 checkTrip reports duplicate ids in dreams and budget", () => {
  const t = Trip.parse({
    ...minimal,
    dreams: [{ id: "x", title: "a", category: "Mat", source: "s", icon: "✨", votes: 0 }],
    budget: [{ id: "x", category: "Mat", amount: 1, paid: false }],
  });
  assert.ok(checkTrip(t).some((m) => m.includes("Duplicate id: x")));
});
