import { test } from "node:test";
import assert from "node:assert/strict";
import { Booking, Trip, checkTrip } from "../src/index.ts";

const base = { id: "b", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-27", status: "paid" };
const trip = (booking: object) => Trip.parse({
  id: "t", revision: 1, title: "T", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], travelers: [],
  days: [
    { id: "d1", date: "2026-10-25", title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [{ id: "lb", text: "Liseberg", placeIds: [] }] },
    { id: "d2", date: "2026-10-26", title: "B", summary: "B", icons: ["🎢"], start: "09:00", end: "18:00", activities: [{ id: "zoo", text: "Zoo", placeIds: [] }] },
  ],
  bookings: [booking],
});

// REQ: BK-07 a booking has a kind (DM-12) with check-in and check-out times for Boende and a start time for Biljett
test("BK-07 kind and times", () => {
  assert.equal(Booking.parse({ ...base, kind: "stay", checkIn: "15:00", checkOut: "11:00" }).checkIn, "15:00");
  assert.equal(Booking.parse({ ...base, kind: "ticket", start: "10:30" }).start, "10:30");
  assert.equal(Booking.parse(base).kind, undefined, "old bookings have no kind");
  assert.throws(() => Booking.parse({ ...base, kind: "boat" }));
  assert.throws(() => Booking.parse({ ...base, checkIn: "3 pm" }));
});

// REQ: BK-08 a Biljett is linked to an activity on its first date
test("BK-08 the linked activity must exist on the booking's first date", () => {
  const ticket = { ...base, to: "2026-10-25", kind: "ticket" };
  assert.deepEqual(checkTrip(trip({ ...ticket, activityId: "lb" })), []);
  assert.match(checkTrip(trip({ ...ticket, activityId: "nope" })).join(), /unknown activity nope/);
  assert.match(checkTrip(trip({ ...ticket, activityId: "zoo" })).join(), /another date/);
});

// REQ: BK-09 the booking keeps each ticket file's name, type and size; at most 2 MB, PDF, PNG or JPEG
test("BK-09 ticket file metadata", () => {
  const f = { id: "a1b2c3d4e5f6a7b8c9d0", name: "biljett.pdf", type: "application/pdf", size: 120_000 };
  assert.deepEqual(Booking.parse({ ...base, files: [f] }).files, [f]);
  assert.throws(() => Booking.parse({ ...base, files: [{ ...f, size: 2 * 1024 * 1024 + 1 }] }), "over 2 MB");
  assert.throws(() => Booking.parse({ ...base, files: [{ ...f, type: "text/html" }] }));
  assert.throws(() => Booking.parse({ ...base, files: [{ ...f, id: "../x" }] }));
  assert.equal(Booking.parse(base).files, undefined, "no files: nothing stored");
});
