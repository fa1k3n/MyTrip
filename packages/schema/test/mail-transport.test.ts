import { test } from "node:test";
import assert from "node:assert/strict";
import { readBooking } from "../src/mailbooking.ts";

const trip = ["2027-11-01", "2027-11-05"];
const ld = (o: object) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

// REQ: BK-38 a train, flight, bus or ferry reservation in schema.org data is a Resa with its places, departure and arrival
test("BK-38 transport from JSON-LD", () => {
  const boat = ld({ "@type": "BoatReservation", reservationNumber: "SC-881", reservationFor: { "@type": "BoatTrip",
    departureBoatTerminal: { name: "Puttgarden" }, arrivalBoatTerminal: { name: "Rødby" }, departureTime: "2027-11-02T14:30:00+01:00", arrivalTime: "2027-11-02T15:15:00+01:00" } });
  assert.deepEqual(readBooking({ subject: "Ihre Buchung", html: boat }, trip), {
    kind: "transport", name: "Puttgarden → Rødby", reference: "SC-881", origin: "Puttgarden", destination: "Rødby", from: "2027-11-02", to: "2027-11-02", start: "14:30", arrival: "15:15",
  });
  const train = readBooking({ subject: "x", html: ld({ "@type": "TrainReservation", reservationFor: { "@type": "TrainTrip", name: "ICE 1234",
    departureStation: { name: "Hamburg Hbf" }, arrivalStation: { name: "Berlin Hbf" }, departureTime: "2027-11-03T09:05", arrivalTime: "2027-11-03T10:51" } }) }, trip);
  assert.deepEqual([train.kind, train.name, train.origin, train.destination, train.start, train.arrival], ["transport", "ICE 1234", "Hamburg Hbf", "Berlin Hbf", "09:05", "10:51"]);
  const flight = readBooking({ subject: "x", html: ld({ "@type": "FlightReservation", reservationFor: { "@type": "Flight",
    departureAirport: { name: "Arlanda", iataCode: "ARN" }, arrivalAirport: { iataCode: "HAM" }, departureTime: "2027-11-01T07:10", arrivalTime: "2027-11-02T00:20" } }) }, trip);
  assert.deepEqual([flight.origin, flight.destination, flight.from, flight.to], ["Arlanda", "HAM", "2027-11-01", "2027-11-02"]);
});

// REQ: BK-38 from the text: a ferry, train, flight or bus confirmation is a Resa, its departure and arrival times after their words
test("BK-38 transport from the text", () => {
  const r = readBooking({ subject: "Bokningsbekräftelse färja", text: "Färja Puttgarden – Rødby\nDatum 2027-11-02\nAvgång 14:30\nAnkomst 15:15\nBokningsnummer SC-881" }, trip);
  assert.deepEqual([r.kind, r.from, r.start, r.arrival], ["transport", "2027-11-02", "14:30", "15:15"]);
  const de = readBooking({ subject: "Ihre Fahrkarte", text: "Zug Hamburg – Berlin am 03.11.2027\nAbfahrt 09:05, Ankunft 10:51" }, trip);
  assert.deepEqual([de.kind, de.start, de.arrival], ["transport", "09:05", "10:51"]);
  assert.equal(readBooking({ subject: "Hotell", text: "Incheckning 15:00, nära tåget. Två nätter." }, trip).kind, "stay", "a hotel near the train is a stay");
});
