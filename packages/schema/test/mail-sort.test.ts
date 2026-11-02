import { test } from "node:test";
import assert from "node:assert/strict";
import { mailKind, readBooking, readWish } from "../src/index.ts";

// REQ: BK-28 booking confirmations are sorted as bookings: schema.org data, a reference, a confirmation word in the subject, a PDF
test("BK-28 what is a booking", () => {
  const ld = `<script type="application/ld+json">{"@type":"LodgingReservation","reservationFor":{"name":"Hotell"}}</script>`;
  assert.equal(mailKind({ subject: "Din vistelse", html: ld }), "booking");
  assert.equal(mailKind({ subject: "Tack!", text: "Ordernummer: HGB-20771\nVälkommen" }), "booking");
  assert.equal(mailKind({ subject: "VB: Bokningsbekräftelse – Hotel Elbblick" }), "booking");
  assert.equal(mailKind({ subject: "Your booking confirmation" }), "booking");
  assert.equal(mailKind({ subject: "Kvitto från färjan" }), "booking");
  assert.equal(mailKind({ subject: "Liseberg" }, true), "booking", "a PDF attachment");
});

// REQ: BK-28 everything else is a wish; "Bokning:" and "Önskan:" first in the subject decide, also after forwarding prefixes
test("BK-28 what is a wish, and the prefixes", () => {
  assert.equal(mailKind({ subject: "Tropiska Badparadiset", text: "https://example.org/bad" }), "wish");
  assert.equal(mailKind({ subject: "Biljetter | Liseberg", text: "https://example.org/biljetter" }), "wish", "a page about tickets is no confirmation");
  assert.equal(mailKind({ subject: "Bokning: Bord på Fischereihafen", text: "https://example.org/bord" }), "booking");
  assert.equal(mailKind({ subject: "Fwd: Önskan: Bokningsbekräftelse som önskan", text: "Bokningsnummer AB123" }, true), "wish");
  assert.equal(readBooking({ subject: "Fwd: Bokning: Bord på Fischereihafen" }).name, "Bord på Fischereihafen");
  assert.equal(readWish({ subject: "Önskan: Hamnrundtur", text: "" }).title, "Hamnrundtur");
});
