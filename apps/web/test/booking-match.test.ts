import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { bookingForm, matchedForm, saveBooking, ticketActivityFor, toBookMatches } from "../src/edit.ts";

const file = (id: string) => ({ id, name: `${id}.pdf`, type: "application/pdf" as const, size: 10 });
const t = () => Trip.parse({
  id: "t", revision: 3, title: "T", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], travelers: [],
  days: [
    { id: "d1", date: "2026-10-25", title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [
      { id: "lb", text: "Liseberg åkband", placeIds: [], start: "10:00" }, { id: "aq", text: "Universeum akvarium", placeIds: [], start: "14:00" }] },
    { id: "d2", date: "2026-10-26", title: "B", summary: "B", icons: ["🎢"], start: "09:00", end: "18:00", activities: [{ id: "zoo", text: "Zoo", placeIds: [] }] },
  ],
  bookings: [
    { id: "hotell", name: "Hotell vid kusten", from: "2026-10-25", to: "2026-10-26", status: "tobook", kind: "stay", url: "https://example.org/boka", placeId: "kust", note: "Fri avbokning", files: [file("aaaaaaaaaaaaaaaa1")] },
    { id: "lisebergtix", name: "Biljetter Liseberg", from: "2026-10-25", to: "2026-10-25", status: "tobook", kind: "ticket" },
    { id: "middag", name: "Bord på restaurang", from: "2026-10-26", to: "2026-10-26", status: "tobook", kind: "other" },
    { id: "klar", name: "Liseberg parkering", from: "2026-10-25", to: "2026-10-25", status: "ready", kind: "other" },
  ],
});

// REQ: BK-22 a reading matches "Att boka" bookings by a shared word, by kind and overlapping dates, never a booking that is already booked
test("BK-22 matching Att boka bookings", () => {
  const ids = (r: Parameters<typeof toBookMatches>[1]) => toBookMatches(t(), r).map((b) => b.id);
  assert.deepEqual(ids({ kind: "ticket", name: "Liseberg", from: "2026-10-25", to: "2026-10-25" }), ["lisebergtix"], "shared word and kind; the ready booking is left out");
  assert.deepEqual(ids({ kind: "stay", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-26" }), ["hotell"], "shared word Kusten");
  assert.deepEqual(ids({ kind: "stay", name: "Strandpensionatet", from: "2026-10-25", to: "2026-10-26" }), ["hotell"], "no shared word, but kind and dates");
  assert.deepEqual(ids({ name: "Strandpensionatet", from: "2026-10-25", to: "2026-10-26" }), [], "no shared word and no kind read");
  assert.deepEqual(ids({ kind: "ticket", name: "Liseberg", from: "2026-10-28", to: "2026-10-28" }), [], "dates that do not overlap");
  assert.deepEqual(ids({ kind: "stay", name: "Liseberg hotell", from: "2026-10-25", to: "2026-10-25" }), ["hotell"], "a ticket is not a stay");
  assert.deepEqual(ids({ name: "Biljetter Liseberg" }), ["lisebergtix"], "no dates read: the name decides");
  assert.deepEqual(ids({}), []);
});

// REQ: BK-22 the best match shares the most words, then has the nearest first date
test("BK-22 best match first", () => {
  const trip = t();
  trip.bookings.push({ id: "hotell2", name: "Hotell vid kusten igen", from: "2026-10-26", to: "2026-10-26", status: "tobook", kind: "stay" });
  assert.deepEqual(toBookMatches(trip, { kind: "stay", name: "Kusten", from: "2026-10-26", to: "2026-10-26" }).map((b) => b.id), ["hotell2", "hotell"]);
  assert.deepEqual(toBookMatches(trip, { kind: "stay", name: "Hotell kusten igen", from: "2026-10-25", to: "2026-10-26" }).map((b) => b.id), ["hotell2", "hotell"]);
});

// REQ: BK-22 the chosen booking is filled in with the reading, gets "klar" and keeps its own files, place, note and link; saving updates it
test("BK-22 updating the chosen booking", () => {
  const trip = t(), hotel = trip.bookings[0]!;
  const form = matchedForm(trip, hotel, { kind: "stay", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-26", checkIn: "15:00", reference: "KST-1" }, [file("cccccccccccccccc1")]);
  assert.equal(form.status, "ready");
  assert.equal(form.name, "Hotell Kusten");
  assert.equal(form.checkIn, "15:00");
  assert.equal(form.placeId, "kust");
  assert.equal(form.note, "Fri avbokning");
  assert.deepEqual(form.files?.map((x) => x.id), ["aaaaaaaaaaaaaaaa1", "cccccccccccccccc1"]);
  const r = saveBooking(trip, form, hotel.id);
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.ops.map((o) => [o.op, o.path]), [["set", "bookings/0"]]);
  const saved = r.ok ? (r.ops[0] as { value: Record<string, unknown> }).value : {};
  assert.equal(saved.id, "hotell");
  assert.equal(saved.url, "https://example.org/boka");
  assert.equal(saved.reference, "KST-1");
  assert.equal(matchedForm(trip, hotel, { status: "cancelled" }, []).status, "cancelled", "a cancellation stays cancelled");
  assert.equal(matchedForm(trip, hotel, {}, []).name, "Hotell vid kusten", "nothing read: the booking's own values");
});

// REQ: BK-22 "Ny bokning" gives the plain form, as before
test("BK-22 a new booking", () => {
  const form = bookingForm(t());
  assert.equal(form.name, "");
  assert.equal(form.from, "2026-10-25");
  assert.equal(form.status, "ready");
  assert.equal(bookingForm(t(), t().bookings[0]).status, "tobook");
});

// REQ: BK-23 a ticket's activity is chosen from shared words in the title, otherwise from the start time, only when one is best
test("BK-23 choosing the ticket's activity", () => {
  assert.equal(ticketActivityFor(t(), "Biljetter till Liseberg", "2026-10-25"), "lb");
  assert.equal(ticketActivityFor(t(), "Entré Universeum", "2026-10-25", "14:00"), "aq");
  assert.equal(ticketActivityFor(t(), "E-biljett", "2026-10-25", "14:00"), "aq", "no shared word: the start time");
  assert.equal(ticketActivityFor(t(), "E-biljett", "2026-10-25", "12:00"), undefined, "no shared word and no start time match");
  assert.equal(ticketActivityFor(t(), "Liseberg och Universeum", "2026-10-25"), undefined, "two equally good");
  assert.equal(ticketActivityFor(t(), "Liseberg", "2026-10-26"), undefined, "only activities on the first date");
});
