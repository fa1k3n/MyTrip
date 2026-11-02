import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { FEATURES } from "../src/ai-features.ts";

const trip = (extra: object = {}) => Trip.parse({
  id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], bookings: [], tasks: [], travelers: [{ id: "a", name: "A", age: 9, packing: [] }],
  places: [{ id: "mw", name: "Miniatur Wunderland", address: "Kehrwieder 2, 20457 Hamburg" }],
  days: [{ id: "d1", date: "2027-11-02", title: "D", summary: "S.", icons: ["🦁"], start: "09:00", end: "18:00", location: "Hamburg", activities: [] }], ...extra,
});
const fp = (name: "prep" | "wishes", t: Trip) => FEATURES[name]!.helper!.fingerprint(t);
const withActivity = (t: Trip, text: string, placeIds: string[] = []) => Trip.parse({ ...t, days: [{ ...t.days[0]!, activities: [{ id: "x", text, placeIds }] }] });

// REQ: AI-88 an activity added by hand runs "Bra att veta" again, by its title and its place
test("AI-88 Bra att veta follows the activities", () => {
  const t = trip();
  assert.notEqual(fp("prep", withActivity(t, "Miniatyrvärlden")), fp("prep", t));
  assert.notEqual(fp("prep", withActivity(t, "Miniatyrvärlden", ["mw"])), fp("prep", withActivity(t, "Miniatyrvärlden")), "its place counts too");
  assert.equal(fp("prep", withActivity(t, "Miniatyrvärlden")), fp("prep", withActivity(t, "Miniatyrvärlden")));
  assert.match(FEATURES.prep!.instructions, /tickets for the planned activities/);
});

// REQ: AI-88 the wish helper is not run again by activities or places, only by the purpose, the days' dates and places and the ages
test("AI-88 Förslag på önskningar ignores activities and places", () => {
  const t = trip();
  assert.equal(fp("wishes", withActivity(t, "Miniatyrvärlden", ["mw"])), fp("wishes", t));
  assert.equal(fp("wishes", trip({ places: [] })), fp("wishes", t), "the trip's places do not count");
  assert.notEqual(fp("wishes", trip({ purpose: "Djur och båtar" })), fp("wishes", t));
  assert.notEqual(fp("wishes", Trip.parse({ ...t, days: [{ ...t.days[0]!, location: "Lübeck" }] })), fp("wishes", t));
});
