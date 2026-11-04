import { test } from "node:test";
import assert from "node:assert/strict";
import { readBooking } from "../src/mailbooking.ts";

const trip = ["2027-11-01", "2027-11-05"];

// REQ: BK-35 the place's telephone and web page from schema.org data
test("BK-35 telephone and web page from JSON-LD", () => {
  const html = `<script type="application/ld+json">{ "@type": "LodgingReservation", "reservationNumber": "HAB-1",
    "reservationFor": { "@type": "LodgingBusiness", "name": "Hotel Am Beispielkai", "telephone": "+49 40 1234567", "url": "https://hotel-beispielkai.example/",
    "address": { "streetAddress": "Beispielkai 7", "postalCode": "20459", "addressLocality": "Hamburg" } } }</script>`;
  const r = readBooking({ subject: "Buchung", html }, trip);
  assert.deepEqual([r.phone, r.website, r.address], ["+49 40 1234567", "https://hotel-beispielkai.example/", "Beispielkai 7, 20459 Hamburg"]);
});

// REQ: BK-35 from the text: a telephone number after a telephone word, never one that is the guest's; a web page after a web word, a www address, or a link to the sender's own domain
test("BK-35 telephone and web page from the text", () => {
  const text = "Ihre Telefonnummer: 070-123 45 67\nHotel Am Beispielkai\nTel.: +49 (0)40 123 45 67\nWebseite: hotel-beispielkai.example/de";
  const r = readBooking({ subject: "Buchung", text }, trip);
  assert.equal(r.phone, "+49 (0)40 123 45 67");
  assert.equal(r.website, "https://hotel-beispielkai.example/de");
  assert.equal(readBooking({ subject: "x", text: "Besök oss på www.hotellkusten.example!" }, trip).website, "https://www.hotellkusten.example");
  const html = `<p><a href="https://track.mailer.example/c/1">Avbeställ</a> <a href="https://www.hotel-beispielkai.example/zimmer?x=1">Zimmer</a></p>`;
  assert.equal(readBooking({ subject: "x", html, from: "Hotel <info@hotel-beispielkai.example>" }, trip).website, "https://www.hotel-beispielkai.example/");
  assert.equal(readBooking({ subject: "x", html }, trip).website, undefined, "without a sender no link is taken");
  assert.equal(readBooking({ subject: "x", text: "Your phone: +46 70 123 45 67\nGuest telephone 0701234567" }, trip).phone, undefined);
});

// REQ: BK-40 the address of a stay from the text, after an address word on the same line or the next
test("BK-40 address of a stay from the text", () => {
  const stay = (t: string) => readBooking({ subject: "Bokningsbekräftelse – Hotell Kajen", text: `Incheckning: 2027-11-01 från kl. 15:00\nUtcheckning: 2027-11-03\n${t}` }, trip);
  assert.equal(stay("Adress: Exempelgatan 12, 411 04 Göteborg").address, "Exempelgatan 12, 411 04 Göteborg");
  assert.equal(stay("Adresse:\nBeispielkai 7, 20459 Hamburg\nTel.: 040 1").address, "Beispielkai 7, 20459 Hamburg");
  assert.equal(stay("Anschrift: Beispielkai 7, 20459 Hamburg").address, "Beispielkai 7, 20459 Hamburg");
  assert.equal(stay("Address: 5 Example Road, Brighton BN1 1AA").address, "5 Example Road, Brighton BN1 1AA");
});
test("BK-40 not the guest's own address or a footer's postal address", () => {
  const t = "Incheckning: 2027-11-01\nUtcheckning: 2027-11-03\nIhre Adresse: Musterweg 1, 10115 Berlin\nYour address: 3 Sample St, London\nDin adress: Provgatan 4, 111 22 Stockholm\n-- \nPostadress: Box 12, 111 11 Stad\nPostal address: PO Box 9, 12345 Town\nE-postadress: info@x.example";
  assert.equal(readBooking({ subject: "Bokningsbekräftelse", text: t }, trip).address, undefined);
});
test("BK-40 schema.org address still wins", () => {
  const html = `<script type="application/ld+json">{ "@type": "LodgingReservation", "reservationNumber": "H-1", "reservationFor": { "@type": "LodgingBusiness", "name": "Hotel X",
    "address": { "streetAddress": "Beispielkai 7", "postalCode": "20459", "addressLocality": "Hamburg" } } }</script>`;
  assert.equal(readBooking({ subject: "Buchung", text: "Incheckning: 2027-11-01\nAdress: Annat 1, 111 11 Stad", html }, trip).address, "Beispielkai 7, 20459 Hamburg");
});
