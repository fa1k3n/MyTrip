import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { emergencyFor, telHref } from "../src/emergency.ts";

const day = (i: number, country?: string) => ({ id: `d${i}`, date: `2026-10-2${i}`, title: "D", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00", activities: [], ...(country ? { country } : {}) });
const trip = (...countries: (string | undefined)[]) => Trip.parse({
  id: "t", revision: 1, title: "T", timezone: "Europe/Stockholm", stops: [], places: [], bookings: [], tasks: [], travelers: [],
  days: countries.map((c, i) => day(i, c)),
});

// REQ: PI-06 the emergency numbers of each country of the trip, in the order of the days, with the country's Swedish name
test("PI-06 emergency numbers per country", () => {
  const list = emergencyFor(trip("DK", "SE", "DE", undefined, "DE"));
  assert.deepEqual(list.map((c) => [c.country, c.name]), [["DK", "Danmark"], ["SE", "Sverige"], ["DE", "Tyskland"]]);
  const de = list[2]!.numbers.map((n) => n.number);
  assert.deepEqual(de.slice(0, 2), ["112", "110"], "the general number first, then the police");
  assert.ok(de.includes("116 117"), "medical advice");
  assert.ok(list[1]!.numbers.some((n) => n.number === "1177"));
  assert.equal(list[0]!.eu, undefined);
});

// REQ: PI-06 a country missing from the table shows 112 with the note that it works in the whole EU; no countries: nothing
test("PI-06 an unknown country", () => {
  const [x] = emergencyFor(trip("MA"));
  assert.deepEqual(x!.numbers.map((n) => n.number), ["112"]);
  assert.equal(x!.eu, true);
  assert.equal(x!.name, "Marocko");
  assert.deepEqual(emergencyFor(trip(undefined)), []);
});

// REQ: PI-06 each number is a link that calls it
test("PI-06 tel links", () => {
  assert.equal(telHref("116 117"), "tel:116117");
  assert.equal(telHref("0900-8844"), "tel:09008844");
});
