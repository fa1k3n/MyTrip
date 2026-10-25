import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "../src/schema.ts";
import { checkTrip } from "../src/check.ts";

const base = { id: "t", revision: 1, title: "t", timezone: "Europe/Stockholm", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [] };

// REQ: BG-03 BG-06 BG-07 a budget item can be an estimate, a range, in another currency, or without a known amount
test("BG-03 BG-06 BG-07 budget items accept estimates, ranges, currencies and unknown amounts", () => {
  const t = Trip.parse({ ...base, budget: [
    { id: "p", category: "Övrigt", paid: false, estimate: true, amount: 75, amountMax: 100, currency: "EUR", note: "Parkering" },
    { id: "u", category: "Övrigt", paid: false, estimate: true },
  ] });
  assert.equal(t.budget[0].amountMax, 100);
  assert.equal(t.budget[1].amount, undefined);
  assert.throws(() => Trip.parse({ ...base, budget: [{ id: "x", category: "Ö", paid: false, currency: "EURO" }] }));
});

// REQ: PI-01 PI-03 PI-04 practical information cards
test("PI-01 PI-03 PI-04 Trip accepts practical information", () => {
  const t = Trip.parse({ ...base, places: [{ id: "garage", name: "Garage", address: "Gatan 1" }], info: [
    { id: "g", title: "Hotellets garage", text: "Infartshöjd 1,8 m.", placeId: "garage", unsuitable: "Bilen är för hög.", verify: true },
  ] });
  assert.equal(t.info[0].unsuitable, "Bilen är för hög.");
  assert.deepEqual(Trip.parse(base).info, []);
  const bad = Trip.parse({ ...base, info: [{ id: "g", title: "G", text: "", placeId: "nope" }] });
  assert.ok(checkTrip(bad).some((m) => m.includes("unknown place nope")));
});

// REQ: PK-01 a shared packing list besides each traveler's own
test("PK-01 Trip has a shared packing list", () => {
  assert.deepEqual(Trip.parse(base).packing, []);
  assert.deepEqual(Trip.parse({ ...base, packing: ["Pass"] }).packing, ["Pass"]);
});
