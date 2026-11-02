import { test } from "node:test";
import assert from "node:assert/strict";
import { readBooking } from "../src/index.ts";

const ld = (extra: string) => `<script type="application/ld+json">{ "@context": "http://schema.org", "@type": "EventReservation",
  "reservationNumber": "EX-1", "reservationFor": { "@type": "Event", "name": "Konsert", "startDate": "2026-10-25T19:00" }, ${extra} }</script>`;

// REQ: BK-24 the price from schema.org: totalPrice as a number, a text or a PriceSpecification, with priceCurrency
test("BK-24 a price from JSON-LD", () => {
  assert.deepEqual(readBooking({ html: ld(`"totalPrice": 1250, "priceCurrency": "SEK"`) }).price, { value: 1250, currency: "SEK" });
  assert.deepEqual(readBooking({ html: ld(`"totalPrice": "89.50", "priceCurrency": "EUR"`) }).price, { value: 89.5, currency: "EUR" });
  assert.deepEqual(readBooking({ html: ld(`"totalPrice": { "@type": "PriceSpecification", "price": 420, "priceCurrency": "DKK" }`) }).price, { value: 420, currency: "DKK" });
  assert.equal(readBooking({ html: ld(`"totalPrice": 1250`) }).price, undefined, "no currency: no price");
});

// REQ: BK-24 the price from the text after a price word, with a code or a sign before or after it, in Swedish and English forms
test("BK-24 a price from the text", () => {
  const price = (text: string) => readBooking({ text }).price;
  assert.deepEqual(price("Bokningsnummer AB123\nTotalt: 1 250,00 kr"), { value: 1250, currency: "SEK" });
  assert.deepEqual(price("Att betala 2.480,50 SEK"), { value: 2480.5, currency: "SEK" });
  assert.deepEqual(price("Total price: €1,250.00"), { value: 1250, currency: "EUR" });
  assert.deepEqual(price("Summa EUR 89"), { value: 89, currency: "EUR" });
  assert.deepEqual(price("Amount paid $ 45.90"), { value: 45.9, currency: "USD" });
  assert.deepEqual(price("Pris: 350 NOK per person\nTotalbelopp: 1 400 NOK"), { value: 1400, currency: "NOK" }, "a total wins over a price per person");
  assert.deepEqual(price("Total 75 £"), { value: 75, currency: "GBP" });
  assert.equal(price("Totalt 3 nätter"), undefined, "no currency");
  assert.equal(price("Ring 0771-123 456 kr"), undefined, "no price word");
  assert.equal(price(""), undefined);
});
