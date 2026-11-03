import { test } from "node:test";
import assert from "node:assert/strict";
import { readBooking } from "../src/mailbooking.ts";

const trip = ["2027-11-01", "2027-11-05"];
const hotel = "vielen Dank für Ihre Buchung im Hotel Am Beispielkai.\nAnreise: Montag\nAdresse:\nHotel Am Beispielkai\nBeispielkai 7";

// REQ: BK-16 forwarding prefixes are left out of the name, also in brackets as [Fwd: …]
test("BK-16 forwarding prefixes in brackets", () => {
  for (const subject of ["[Fwd: Hotel Am Beispielkai]", "Fwd: [Fwd: Hotel Am Beispielkai]", "[VB: Bokning: Hotel Am Beispielkai]"])
    assert.equal(readBooking({ subject, text: hotel }, trip).name, "Hotel Am Beispielkai", subject);
});

// REQ: BK-16 a subject in another language: confirmation words of common languages are no name
test("BK-16 confirmation words in other languages", () => {
  for (const subject of ["Ihre Buchungsbestätigung – Hotel Am Beispielkai", "Fwd: Ihre Buchungsbestätigung – Hotel Am Beispielkai",
    "Buchungsbestätigung: Hotel Am Beispielkai", "Confirmation de réservation - Hotel Am Beispielkai", "Reservierungsbestätigung | Hotel Am Beispielkai"])
    assert.equal(readBooking({ subject, text: hotel }, trip).name, "Hotel Am Beispielkai", subject);
});

// REQ: BK-16 a subject in parts (–, -, |) in any language: the one part that the mail's text also names is the name
test("BK-16 the part of the subject that the text names", () => {
  assert.equal(readBooking({ subject: "Rezervace potvrzena – Penzion Příklad", text: "Děkujeme. Penzion Příklad, Hlavní 1" }, trip).name, "Penzion Příklad");
  assert.equal(readBooking({ subject: "Penzion Příklad | Rezervace potvrzena", text: "Penzion Příklad" }, trip).name, "Penzion Příklad");
  assert.equal(readBooking({ subject: "Hotell Kusten - Göteborg", text: "Välkommen" }, trip).name, "Hotell Kusten - Göteborg", "no part in the text: the whole subject");
  assert.equal(readBooking({ subject: "Kusten - Kusten Spa", text: "Kusten Spa och Kusten" }, trip).name, "Kusten - Kusten Spa", "more than one part in the text: the whole subject");
});

// REQ: BK-16 the date a mail was sent or forwarded is no booking date, nor a date far from the trip, so "Läs med AI" can fill them
test("BK-16 forwarding dates and dates far from the trip are left out", () => {
  const fwd = "---------- Forwarded message ---------\nFrom: Hotel Am Beispielkai <info@hotel.example>\nDate: Tue, 3 Nov 2026 at 10:00\nDatum: 03.11.2026\nGesendet: 2027-10-28\nSubject: Ihre Buchungsbestätigung\n\n" + hotel;
  const r = readBooking({ subject: "Fwd: Ihre Buchungsbestätigung – Hotel Am Beispielkai", text: fwd }, trip);
  assert.deepEqual([r.from, r.to], [undefined, undefined]);
  assert.equal(readBooking({ subject: "Hotell", text: "Bokad 2026-05-01. Incheckning 2027-11-02" }, trip).from, "2027-11-02");
  assert.equal(readBooking({ subject: "Hotell", text: "Ankomst 2027-10-31" }, trip).from, "2027-10-31", "a day next to the trip stays");
  assert.equal(readBooking({ subject: "Hotell", text: "Bokad 2026-05-01" }, trip).from, undefined, "only far dates: none");
  assert.equal(readBooking({ subject: "Hotell", text: "Ankomst 2026-05-01" }).from, "2026-05-01", "a trip without dates takes what is there");
});
