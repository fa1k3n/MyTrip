import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { addPacking, isPacked, packedCount, removePacking, togglePacked } from "../src/edit.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], days: [], places: [], bookings: [], tasks: [],
  packing: ["Pass", "Laddare"], travelers: [{ id: "anna", name: "Anna", packing: ["Badkläder"] }],
});
const run = (t: Trip, ops: Parameters<typeof applyOps>[1]) => Trip.parse(applyOps(t, ops));

test("PK-05 nothing is packed at first", () => {
  const t = trip();
  assert.deepEqual([t.packed, t.travelers[0].packed], [[], []]);
  assert.equal(isPacked(t, "shared", "Pass"), false);
});

test("PK-05 an item is checked and unchecked, in the shared list and a traveler's list", () => {
  let t = run(trip(), togglePacked(trip(), "shared", "Pass"));
  t = run(t, togglePacked(t, "anna", "Badkläder"));
  assert.deepEqual([t.packed, t.travelers[0].packed], [["Pass"], ["Badkläder"]]);
  assert.equal(isPacked(t, "shared", "Pass") && isPacked(t, "anna", "Badkläder"), true);
  assert.deepEqual(packedCount(t, "shared"), { packed: 1, total: 2 });
  t = run(t, togglePacked(t, "shared", "Pass"));
  assert.deepEqual(t.packed, []);
  assert.deepEqual(t.packing, ["Pass", "Laddare"]); // the list itself is unchanged
});

test("PK-05 removing a packed item also removes its check, and a new item with the same name starts unchecked", () => {
  let t = run(trip(), togglePacked(trip(), "shared", "Pass"));
  t = run(t, removePacking(t, "shared", 0));
  assert.deepEqual([t.packing, t.packed], [["Laddare"], []]);
  const r = addPacking(t, "shared", "Pass");
  t = run(t, r.ok ? r.ops : []);
  assert.equal(isPacked(t, "shared", "Pass"), false);
});

test("PK-05 an unknown list gives no changes", () => {
  assert.deepEqual(togglePacked(trip(), "nobody", "Pass"), []);
});
