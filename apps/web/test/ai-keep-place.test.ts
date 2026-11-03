import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { keepAi, keepAllAi } from "../src/aiReview.ts";
import { confirmPlaceOps } from "../src/place.ts";

const t = () => Trip.parse({
  id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], tasks: [], travelers: [], bookings: [],
  places: [{ id: "zoo", name: "Tierpark Hagenbeck", address: "Lokstedter Grenzstraße 2", ai: true }, { id: "hem", name: "Hem", address: "Gatan 1", ai: true }],
  dreams: [{ id: "w", title: "Tierpark Hagenbeck", category: "Aktivitet", source: "AI-hjälpen", icon: "✨", votes: 0, ai: true }],
  days: [{ id: "d1", date: "2027-11-01", title: "A", summary: "A", icons: ["Natur"], start: "09:00", end: "18:00",
    activities: [{ id: "a", text: "Tierpark Hagenbeck", dreamId: "w", placeIds: ["zoo"], estimated: true, ai: true }] }],
});
const after = (ops: unknown[]) => Trip.parse(applyOps(t(), ops as never));
const marks = (x: Trip) => [x.dreams[0]!.ai, x.days[0]!.activities[0]!.ai, x.places[0]!.ai, x.places[1]!.ai];

// REQ: AI-83 DQ-01 keeping an AI wish or its activity also confirms the places they use, in one step
test("AI-83 keeping a wish confirms its place", () => {
  assert.deepEqual(marks(after(keepAi(t(), { kind: "wish", id: "w" }))), [undefined, undefined, undefined, true]);
  assert.deepEqual(marks(after(keepAi(t(), { kind: "activity", dayId: "d1", id: "a" }))), [undefined, undefined, undefined, true]);
});

// REQ: DQ-01 AI-83 Kontrollerad on a place also keeps the AI activities and wishes that use it
test("DQ-01 a checked place keeps its wish", () => {
  assert.deepEqual(marks(after(confirmPlaceOps(t(), "zoo"))), [undefined, undefined, undefined, true]);
  assert.deepEqual(marks(after(confirmPlaceOps(t(), "hem"))), [true, true, true, undefined], "a place no AI item uses");
});

// REQ: AI-84 DQ-01 Behåll allt confirms the AI places too
test("AI-84 keeping all confirms the places", () => {
  assert.deepEqual(marks(after(keepAllAi(t()))), [undefined, undefined, undefined, undefined]);
});
