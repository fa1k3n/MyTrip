import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip, readBooking } from "@trip/schema";
import { bookingForm, readingToForm, saveBooking } from "../src/edit.ts";

const t = (places: object[] = []) => Trip.parse({
  id: "t", revision: 1, title: "Hamburg", timezone: "Europe/Berlin", currency: "SEK", stops: [], tasks: [], travelers: [], budget: [], bookings: [], places,
  days: [{ id: "d1", date: "2027-11-01", title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [] }],
});
const hotel = { kind: "stay" as const, name: "Hotel Am Beispielkai", address: "Beispielkai 7, 20459 Hamburg", phone: "+49 40 1234567", website: "https://hotel-beispielkai.example/", from: "2027-11-01", to: "2027-11-05" };

// REQ: BK-36 a reading with an address proposes a new place with the name, address, telephone and web page read
test("BK-36 a new place is proposed", () => {
  const f = readingToForm(bookingForm(t()), hotel);
  assert.equal(f.placeId, "__new");
  assert.deepEqual(f.newPlace, { name: "Hotel Am Beispielkai", address: "Beispielkai 7, 20459 Hamburg", phone: "+49 40 1234567", website: "https://hotel-beispielkai.example/" });
  assert.equal(readingToForm(bookingForm(t()), { ...hotel, address: undefined }).placeId, "", "no address: no new place");
});

// REQ: BK-36 a place of the trip with the same name, ignoring case and accents, is chosen instead; a place already chosen stays
test("BK-36 an existing place is chosen", () => {
  const trip = t([{ id: "p1", name: "hotel am beispielkai", address: "Beispielkai 7" }]);
  assert.equal(readingToForm(bookingForm(trip), hotel, trip).placeId, "p1");
  assert.equal(readingToForm(bookingForm(trip), { ...hotel, address: undefined }, trip).placeId, "p1", "by name also without an address");
  assert.equal(readingToForm({ ...bookingForm(trip), placeId: "p1" }, { ...hotel, name: "Annat" }, trip).placeId, "p1");
});

// REQ: BK-36 saving adds the place first and links the booking to it; a new place needs a name and an address and a valid web page
test("BK-36 saving the booking adds its place", () => {
  const f = { ...readingToForm(bookingForm(t()), hotel), name: "Hotel Am Beispielkai" };
  const r = saveBooking(t(), f);
  assert.ok(r.ok);
  const next = Trip.parse(applyOps(t(), r.ok ? r.ops : []));
  const place = next.places[0]!;
  assert.deepEqual([place.name, place.address, place.phone, place.website], ["Hotel Am Beispielkai", "Beispielkai 7, 20459 Hamburg", "+49 40 1234567", "https://hotel-beispielkai.example/"]);
  assert.equal(next.bookings[0]!.placeId, place.id);
  assert.notEqual(next.bookings[0]!.id, place.id, "the booking and its place have ids of their own");
  assert.ok(!saveBooking(t(), { ...f, newPlace: { ...f.newPlace!, address: " " } }).ok);
  assert.ok(!saveBooking(t(), { ...f, newPlace: { ...f.newPlace!, website: "inte en adress" } }).ok);
});

// REQ: BK-36 "Ny plats…" chosen by hand, with its fields left empty, says what is missing instead of failing silently
test("BK-36 an empty new place says what is missing", () => {
  const r = saveBooking(t(), { ...bookingForm(t()), name: "Testhotell", placeId: "__new" });
  assert.deepEqual(r, { ok: false, error: "Ange namn och adress för den nya platsen." });
});

// REQ: BK-40 a hotel mail with its address, telephone and web page only as text becomes a place with all three
test("BK-40 a mail's text address makes the approved stay a place", () => {
  const text = "Tack för din bokning hos Hotell Kajen (exempel)!\nBokningsnummer: HK-48213\nIncheckning: 2027-11-01 från kl. 15:00\nUtcheckning: 2027-11-03 senast kl. 11:00\n\nAdress: Exempelgatan 12, 411 04 Göteborg\nTelefon: 031-10 20 30\nWebbplats: hotellkajen.example.com\n";
  const reading = readBooking({ subject: "Fwd: Bokningsbekräftelse – Hotell Kajen", text }, ["2027-11-01", "2027-11-03"]);
  const f = readingToForm(bookingForm(t()), reading);
  const r = saveBooking(t(), f);
  assert.ok(r.ok);
  const place = Trip.parse(applyOps(t(), r.ok ? r.ops : [])).places[0]!;
  assert.deepEqual([place.address, place.phone, place.website], ["Exempelgatan 12, 411 04 Göteborg", "031-10 20 30", "https://hotellkajen.example.com"]);
});
