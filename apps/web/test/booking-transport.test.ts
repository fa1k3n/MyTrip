import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { bookingForm, readingToForm, saveBooking } from "../src/edit.ts";
import { bookingTimes } from "../src/format.ts";

const t = () => Trip.parse({
  id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", currency: "SEK", stops: [], places: [], tasks: [], travelers: [], budget: [], bookings: [],
  days: [{ id: "d1", date: "2027-11-02", title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [] }],
});

// REQ: BK-37 a Resa has from, to, departure and arrival in the form; only a Resa keeps them
test("BK-37 saving a Resa", () => {
  const f = { ...bookingForm(t()), name: "Färjan", from: "2027-11-02", to: "2027-11-02", kind: "transport" as const, origin: "Puttgarden", destination: "Rødby", start: "14:30", arrival: "15:15" };
  const r = saveBooking(t(), f);
  assert.ok(r.ok);
  const b = Trip.parse(applyOps(t(), r.ok ? r.ops : [])).bookings[0]!;
  assert.deepEqual([b.kind, b.origin, b.destination, b.start, b.arrival], ["transport", "Puttgarden", "Rødby", "14:30", "15:15"]);
  const ticket = saveBooking(t(), { ...f, kind: "ticket" });
  const tb = Trip.parse(applyOps(t(), ticket.ok ? ticket.ops : [])).bookings[0]!;
  assert.deepEqual([tb.origin, tb.arrival, tb.start], [undefined, undefined, "14:30"], "a ticket keeps its start only");
  assert.ok(!saveBooking(t(), { ...f, arrival: "kvart över tre" }).ok);
});

// REQ: BK-37 a reading fills in a Resa; the booking shows its departure, places and arrival
test("BK-37 a Resa read and shown", () => {
  const f = readingToForm(bookingForm(t()), { kind: "transport", origin: "Hamburg Hbf", destination: "Berlin Hbf", start: "09:05", arrival: "10:51" });
  assert.deepEqual([f.kind, f.origin, f.destination, f.start, f.arrival], ["transport", "Hamburg Hbf", "Berlin Hbf", "09:05", "10:51"]);
  assert.equal(bookingTimes({ kind: "transport", start: "14:30", origin: "Puttgarden", destination: "Rødby", arrival: "15:15" }), "kl. 14.30 Puttgarden → Rødby, framme 15.15");
  assert.equal(bookingTimes({ kind: "transport", start: "14:30", origin: "Puttgarden" }), "kl. 14.30 från Puttgarden");
  assert.equal(bookingTimes({ kind: "transport" }), "");
  assert.equal(bookingTimes({ kind: "transport", name: "Puttgarden → Rødby", start: "14:30", origin: "Puttgarden", destination: "Rødby", arrival: "15:15" }), "kl. 14.30, framme 15.15", "the name already says where");
});
