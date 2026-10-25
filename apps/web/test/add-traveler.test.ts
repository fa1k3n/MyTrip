import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { applyOps } from "@trip/schema/src/ops.ts";
import { addTraveler } from "../src/edit.ts";
import { sv } from "../src/sv.ts";

const trip = () => Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Stockholm", stops: [], days: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }] });

// REQ: AU-26 the settings add a traveler by name, with a readable unique id and an empty packing list
test("AU-26 addTraveler", () => {
  const r = addTraveler(trip(), "  Erik ");
  assert.ok(r.ok);
  assert.deepEqual(applyOps(trip(), r.ops).travelers.at(-1), { id: "erik", name: "Erik", packing: [], packed: [] });
  const again = addTraveler(trip(), "Anna");
  assert.ok(again.ok);
  assert.equal(applyOps(trip(), again.ops).travelers.at(-1)!.id, "anna-2", "the id is unique in the trip");
  assert.deepEqual(addTraveler(trip(), " "), { ok: false, error: sv.errors.name });
});
