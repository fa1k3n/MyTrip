import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFor, AccessConfig, checkTrip, levelsFor, opNeeds, Trip } from "../src/index.ts";

const trip = (extra: object = {}) => Trip.parse({ id: "t", revision: 1, title: "t", timezone: "UTC", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [], ...extra });

// REQ: MI-21 Minnen is a component of Minnas with Dold, Läsa and Ändra; a Följare can only get Dold; Ändra by default for persons
test("MI-21 the Minnen component and its defaults", () => {
  assert.deepEqual(levelsFor("traveler", "mi", "memories"), ["hidden", "read", "write"]);
  assert.deepEqual(levelsFor("follower", "mi", "memories"), ["hidden"]);
  assert.deepEqual(["follower", "traveler", "planner"].map((r) => accessFor(trip(), r as "traveler").view.mi.memories), ["hidden", "write", "write"]);
  assert.equal(accessFor(trip({ access: { traveler: { mi: { parts: { memories: "read" } } } } }), "traveler").view.mi.memories, "read");
  assert.equal(accessFor(trip({ access: { traveler: { mi: { visible: false } } } }), "traveler").view.mi.memories, "hidden", "a hidden page hides it");
  assert.throws(() => AccessConfig.parse({ follower: { mi: { parts: { memories: "read" } } } }));
  assert.deepEqual(opNeeds({ op: "add", path: "memories/-", value: {} }), { part: "memories", level: "write" });
  assert.deepEqual(opNeeds({ op: "set", path: "album", value: "https://x.example.org" }), { part: "trip", level: "write" }, "the album belongs to the settings (MI-20)");
});

// REQ: MI-17 one memory per traveler and wish, with a known verdict and at most 140 characters
test("MI-17 a memory per traveler and wish", () => {
  const m = (id: string, by: string) => ({ id, dreamId: "w1", by, verdict: "again" });
  assert.deepEqual(checkTrip(trip({ memories: [m("m1", "anna"), m("m2", "bo")] })), []);
  assert.ok(checkTrip(trip({ memories: [m("m1", "anna"), m("m2", "anna")] })).length > 0);
  assert.throws(() => trip({ memories: [{ ...m("m1", "anna"), note: "x".repeat(141) }] }));
  assert.throws(() => trip({ memories: [{ ...m("m1", "anna"), verdict: "super" }] }));
});

// REQ: MI-19 an activity's wish must exist
test("MI-19 the linked wish must exist", () => {
  const days = (dreamId: string) => [{ id: "d1", date: "2026-10-20", title: "D", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [{ id: "a1", text: "Zoo", placeIds: [], dreamId }] }];
  const dreams = [{ id: "w1", title: "Zoo", category: "Aktivitet", source: "", icon: "star", votes: 0 }];
  assert.deepEqual(checkTrip(trip({ days: days("w1"), dreams })), []);
  assert.ok(checkTrip(trip({ days: days("w2"), dreams })).some((x) => x.includes("w2")));
});
