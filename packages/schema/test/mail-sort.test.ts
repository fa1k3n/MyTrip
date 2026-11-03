import { test } from "node:test";
import assert from "node:assert/strict";
import { mailKind, mailSure, readBooking, readWish } from "../src/index.ts";

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

// REQ: BK-31 signals in any language: a labelled code with letters and digits, or a price with a currency and a date in figures
test("BK-31 bookings in any language", () => {
  assert.equal(mailKind({ subject: "Ihre Buchungsbestätigung", text: "Guten Tag,\nBuchungsnummer: HAB-48213\nAnreise: Montag" }), "booking");
  assert.equal(mailKind({ subject: "예약 확인", text: "안녕하세요\n예약번호: K7Q2-881\n체크인 15:00" }), "booking");
  assert.equal(mailKind({ subject: "予約の確認", text: "合計 ¥ 24,800\nご到着 2027年11月1日" }), "booking");
  assert.equal(mailKind({ subject: "Rezerwacja", text: "Razem: 1 240,00 PLN\nPrzyjazd 01.11.2027" }), "booking");
  assert.equal(mailKind({ subject: "확인", text: "총액 ₩320,000\n2027년 11월 1일" }), "booking");
});

// REQ: BK-31 a price, a date or a code without letters alone is not a booking
test("BK-31 what is not enough", () => {
  assert.equal(mailKind({ subject: "Glass vid hamnen", text: "Kostar bara 4 € styck!" }), "wish");
  assert.equal(mailKind({ subject: "Marknad", text: "Julmarknaden öppnar 2027-11-20" }), "wish");
  assert.equal(mailKind({ subject: "Ring", text: "Telefon: 040-123 45 67\nhttps://example.org" }), "wish");
  assert.equal(mailKind({ subject: "Kolla här", text: "Länk: https://example.org/park-2027" }), "wish");
});

// REQ: BK-32 the rules are sure of a booking signal or an "Önskan:" prefix; otherwise the AI service may decide
test("BK-32 when the rules are sure", () => {
  assert.equal(mailSure({ subject: "Tropiska Badparadiset", text: "https://example.org/bad" }), false);
  assert.equal(mailSure({ subject: "Önskan: Hamnrundtur" }), true);
  assert.equal(mailSure({ subject: "Fwd: Bokning: Bord" }), true);
  assert.equal(mailSure({ subject: "Tack", text: "예약번호: K7Q2-881" }), true);
  assert.equal(mailSure({ subject: "Liseberg" }, true), true);
});
