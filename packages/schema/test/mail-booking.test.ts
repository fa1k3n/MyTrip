import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlText, readBooking } from "../src/index.ts";

const trip = ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"];

// REQ: BK-16 schema.org LodgingReservation in JSON-LD gives kind, name, dates, times, reference and address
test("BK-16 a hotel from JSON-LD", () => {
  const html = `<html><head><script type="application/ld+json">{
    "@context": "http://schema.org", "@type": "LodgingReservation", "reservationNumber": "HK-48213",
    "reservationStatus": "http://schema.org/ReservationConfirmed",
    "reservationFor": { "@type": "LodgingBusiness", "name": "Hotell Kusten",
      "address": { "@type": "PostalAddress", "streetAddress": "Hamngatan 1", "postalCode": "411 01", "addressLocality": "Göteborg" } },
    "checkinTime": "2026-10-25T15:00:00+02:00", "checkoutTime": "2026-10-27T11:00:00+01:00" }</script></head><body>Tack!</body></html>`;
  assert.deepEqual(readBooking({ subject: "Din bokning", html }, trip), {
    kind: "stay", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-27", checkIn: "15:00", checkOut: "11:00",
    reference: "HK-48213", address: "Hamngatan 1, 411 01 Göteborg",
  });
});

// REQ: BK-16 an EventReservation, also inside a list or @graph; a cancelled one is read as cancelled
test("BK-16 a ticket from JSON-LD", () => {
  const ld = { "@graph": [{ "@type": "Organization", name: "X" }, {
    "@type": "EventReservation", reservationNumber: "LB 7731", reservationStatus: "https://schema.org/ReservationCancelled",
    reservationFor: { "@type": "Event", name: "Liseberg – Halloween", startDate: "2026-10-25T11:00", location: { name: "Liseberg", address: "Örgrytevägen 5, Göteborg" } },
  }] };
  const html = `<script type='application/ld+json'>${JSON.stringify([ld])}</script>`;
  assert.deepEqual(readBooking({ subject: "Biljetter", html }, trip), {
    kind: "ticket", name: "Liseberg – Halloween", from: "2026-10-25", to: "2026-10-25", start: "11:00", reference: "LB 7731",
    status: "cancelled", address: "Örgrytevägen 5, Göteborg",
  });
  assert.equal(readBooking({ subject: "x", html: "<script type=\"application/ld+json\">{ not json</script>" }).name, "x", "broken JSON-LD: the text is read");
});

// REQ: BK-16 without schema.org data the subject, reference, dates, times and kind are read from the text
test("BK-16 a forwarded Swedish hotel confirmation as text", () => {
  const text = `---------- Vidarebefordrat meddelande ---------
Från: Hotell Kusten <bokning@kusten.example>
Datum: 1 oktober 2026

Hej Anna!
Tack för din bokning, bokad 2026-10-01.
Bokningsnummer: KST-99812
Ankomst: lördag 25 oktober 2026, incheckning från kl. 15.00
Avresa: 27 oktober 2026, utcheckning senast 11:00
2 nätter, dubbelrum`;
  assert.deepEqual(readBooking({ subject: "VB: Fwd: Bokningsbekräftelse – Hotell Kusten, Göteborg", text }, trip), {
    kind: "stay", name: "Hotell Kusten, Göteborg", from: "2026-10-25", to: "2026-10-27", checkIn: "15:00", checkOut: "11:00", reference: "KST-99812",
  });
});

// REQ: BK-16 dates as 27/10/2026, 27.10.2026 and 25 okt (the trip's year); a ticket's start time; dates within the trip preferred
test("BK-16 an entrance ticket as text", () => {
  const text = "Orderbekräftelse\nOrdernummer #A55120\nKöpt 12.09.2026\nE-biljett: Universeum, entré 26/10/2026 kl 10:30\nVisa biljetten i entrén.";
  assert.deepEqual(readBooking({ subject: "Tack för ditt köp: Universeum", text }, trip), {
    kind: "ticket", name: "Universeum", from: "2026-10-26", to: "2026-10-26", start: "10:30", reference: "A55120",
  });
  assert.equal(readBooking({ subject: "Biljett", text: "Inträde 26 okt" }, trip).from, "2026-10-26");
  assert.equal(readBooking({ subject: "Booking confirmation", text: "Booking number: XK4471\nDate 2026-10-25" }, trip).reference, "XK4471");
});

// REQ: BK-16 what cannot be read is left out, and words alone without digits are no reference
test("BK-16 nothing to read", () => {
  assert.deepEqual(readBooking({ subject: "Re: hej", text: "Referens: se nedan" }, trip), { name: "hej" });
  assert.deepEqual(readBooking({}), {});
});

// REQ: BK-16 a mail with only HTML is read through its text
test("BK-16 htmlText", () => {
  assert.equal(htmlText("<style>p{}</style><p>Bokningsnummer:&nbsp;<b>AB12</b></p><p>R&auml;ksm&ouml;rg&#229;s &amp; mer</p>"), "Bokningsnummer: AB12\nRäksmörgås & mer");
  assert.equal(readBooking({ subject: "Hotell", html: "<div>Bokningsnummer: <b>QQ123</b></div><div>Incheckning 25/10/2026 15:00</div>" }, trip).reference, "QQ123");
});
