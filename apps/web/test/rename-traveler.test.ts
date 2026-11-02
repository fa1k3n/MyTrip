import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { applyOps } from "@trip/schema/src/ops.ts";
import { renameTraveler } from "../src/edit.ts";
import { sv } from "../src/sv.ts";

const trip = () => Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Stockholm", stops: [], days: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "v1", name: "Vuxen 1", packing: [] }, { id: "b7", name: "Barn (7 år)", age: 7, packing: ["Mössa"] }] });

// REQ: AU-32 a traveler is renamed in the settings; the id, the age and the packing list stay
test("AU-32 renameTraveler", () => {
  const r = renameTraveler(trip(), "b7", "  Olle ");
  assert.ok(r.ok);
  assert.deepEqual(applyOps(trip(), r.ops).travelers[1], { id: "b7", name: "Olle", age: 7, packing: ["Mössa"], packed: [] });
  assert.deepEqual(renameTraveler(trip(), "b7", " "), { ok: false, error: sv.errors.name });
  assert.equal(renameTraveler(trip(), "nobody", "X").ok, false, "an unknown traveler is rejected");
  const same = renameTraveler(trip(), "v1", "Vuxen 1");
  assert.ok(same.ok);
  assert.deepEqual(same.ops, [], "an unchanged name makes no change");
});
