import { test } from "node:test";
import assert from "node:assert/strict";
import { stepIcon, stepText, transitNote } from "../src/transport.ts";
import { sv } from "../src/sv.ts";

// REQ: TR-23 the steps as text: walking minutes, and each ride with line, direction, times, stops
test("TR-23 steps as short Swedish lines", () => {
  assert.equal(stepText({ kind: "walk", min: 4 }), "Gå 4 min");
  assert.equal(stepText({ kind: "ride", line: "U2", vehicle: "metro", headsign: "Ruhleben", from: "Rosenthaler Platz", to: "Zoologischer Garten", dep: "10:02", arr: "10:17", stops: 9 }),
    "Tunnelbana U2 mot Ruhleben: 10.02 Rosenthaler Platz – 10.17 Zoologischer Garten, 9 hållplatser");
  assert.equal(stepText({ kind: "ride", line: "", vehicle: "ferry", from: "A", to: "B", stops: 1 }), "Färja: A – B, 1 hållplats");
  assert.deepEqual([stepIcon({ kind: "walk", min: 1 }), stepIcon({ kind: "ride", line: "", vehicle: "train", from: "", to: "" }), stepIcon({ kind: "ride", line: "", vehicle: "bus", from: "", to: "" })],
    ["walk", "train", "transit"]);
});

// REQ: TR-24 far ahead the steps come with a note: no timetable yet, so this is the same time on the nearest same weekday
test("TR-24 the note of a trip far ahead", () => {
  assert.equal(transitNote({ status: "ok", steps: [], example: "2026-10-16" }), "Google har ingen tidtabell för resdagen än. Så här går det samma tid fre 16 okt:");
  assert.equal(transitNote({ status: "ok", steps: [] }), undefined);
  assert.equal(transitNote({ status: "none", far: true }), "Google har ingen tidtabell så långt fram än. Försök igen närmare resan, eller använd Visa resvägen.");
  assert.equal(transitNote({ status: "none" }), sv.transit.none);
});

// REQ: TR-25 without a Routes key on the server the steps say that lines are off, not that no trip was found
test("TR-25 lines turned off", () => {
  assert.equal(transitNote({ status: "off" }), "Linjer är inte påslagna i det här Basläger än. Använd Visa resvägen.");
  assert.equal(transitNote({ status: "none" }), "Hittade ingen resa med kollektivtrafik. Använd Visa resvägen.");
});
