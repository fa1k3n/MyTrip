import { test } from "node:test";
import assert from "node:assert/strict";
import { stepIcon, stepText } from "../src/transport.ts";

// REQ: TR-23 the steps as text: walking minutes, and each ride with line, direction, times, stops
test("TR-23 steps as short Swedish lines", () => {
  assert.equal(stepText({ kind: "walk", min: 4 }), "Gå 4 min");
  assert.equal(stepText({ kind: "ride", line: "U2", vehicle: "metro", headsign: "Ruhleben", from: "Rosenthaler Platz", to: "Zoologischer Garten", dep: "10:02", arr: "10:17", stops: 9 }),
    "Tunnelbana U2 mot Ruhleben: 10.02 Rosenthaler Platz – 10.17 Zoologischer Garten, 9 hållplatser");
  assert.equal(stepText({ kind: "ride", line: "", vehicle: "ferry", from: "A", to: "B", stops: 1 }), "Färja: A – B, 1 hållplats");
  assert.deepEqual([stepIcon({ kind: "walk", min: 1 }), stepIcon({ kind: "ride", line: "", vehicle: "train", from: "", to: "" }), stepIcon({ kind: "ride", line: "", vehicle: "bus", from: "", to: "" })],
    ["walk", "train", "transit"]);
});
