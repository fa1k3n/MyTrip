import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "../src/schema.ts";
import { Settings, aiOnForTrip } from "../src/settings.ts";

const base = { id: "t", revision: 1, title: "t", timezone: "Europe/Stockholm", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [] };

// REQ: AI-62 a trip's AI switch is on by default
test("AI-62 Trip.ai defaults to on", () => {
  assert.equal(Trip.parse(base).ai, true);
  assert.equal(Trip.parse({ ...base, ai: false }).ai, false);
});

// REQ: AI-62 the trip switch only narrows the instance settings
test("AI-62 aiOnForTrip needs both the instance and the trip", () => {
  const on = Settings.parse({ ai: { enabled: true, areas: { mail: false } } });
  const off = Settings.parse({});
  assert.equal(aiOnForTrip(on, "images", true, { ai: true }), true);
  assert.equal(aiOnForTrip(on, "images", true, { ai: false }), false);
  assert.equal(aiOnForTrip(on, "mail", true, { ai: true }), false); // a trip cannot turn on what the instance has off
  assert.equal(aiOnForTrip(off, "images", true, { ai: true }), false);
  assert.equal(aiOnForTrip(on, "images", false, { ai: true }), false);
});
