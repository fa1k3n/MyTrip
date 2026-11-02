import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { draftSummary } from "../src/proposals.ts";

// REQ: AI-75 the draft dialog lists the title, the travelers and the days in words
test("AI-75 draftSummary", () => {
  const day = (id: string, date: string, title: string, legs: object[]) => ({ id, date, title, summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00", location: title, legs, activities: [] });
  const next = Trip.parse({ id: "x", revision: 1, title: "Höstlov i Hamburg", timezone: "Europe/Stockholm", stops: [], places: [], bookings: [], tasks: [],
    travelers: [{ id: "v1", name: "Vuxen 1", packing: [] }, { id: "b7", name: "Barn (7 år)", age: 7, packing: [] }, { id: "olle", name: "Olle", age: 10, packing: [] }],
    days: [day("d1", "2027-10-26", "Hamburg", []), day("d0", "2027-10-25", "Malmö–Hamburg", [{ vehicle: "car", origin: "Malmö", destination: "Hamburg", durationMin: 240 }])] });
  assert.deepEqual(draftSummary(next), {
    title: "Höstlov i Hamburg",
    travelers: ["Vuxen 1", "Barn (7 år)", "Olle, 10 år"],
    days: ["mån 25 okt · Malmö–Hamburg · bil 4 h", "tis 26 okt · Hamburg"],
  });
});
