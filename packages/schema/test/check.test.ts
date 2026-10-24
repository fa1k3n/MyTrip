import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTrip } from "../src/check.ts";

const base: any = {
  revision: 1, title: "t", timezone: "UTC", stops: [{ label: "A", sub: "", dayId: "d1" }],
  days: [{ id: "d1", date: "2026-01-02", title: "x", summary: "y", icons: ["a"], start: "08:00", end: "18:00", activities: [{ id: "a1", text: "t", placeIds: ["p1"] }] }],
  places: [{ id: "p1", name: "P", address: "Street 1" }],
  bookings: [{ id: "b1", name: "B", from: "2026-01-02", to: "2026-01-03", status: "paid" }],
  tasks: [], travelers: [],
};

// REQ: DM-09 references to missing identifiers are reported
test("DM-09 reports unknown references", () => {
  const t = structuredClone(base);
  t.days[0].activities[0].placeIds = ["nope"];
  t.stops[0].dayId = "gone";
  const p = checkTrip(t);
  assert.ok(p.some((m) => m.includes("unknown place nope")));
  assert.ok(p.some((m) => m.includes("unknown day gone")));
});

// REQ: DQ-04 a booking outside the trip days is reported, a cancelled one is not
test("DQ-04 reports bookings outside the trip", () => {
  assert.deepEqual(checkTrip(structuredClone(base)).filter((m) => m.includes("outside")), ["Booking b1 is outside the days of the trip"]);
  const t = structuredClone(base);
  t.bookings[0].status = "cancelled";
  assert.equal(checkTrip(t).length, 0);
});
