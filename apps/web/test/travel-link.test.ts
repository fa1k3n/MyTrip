import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { wayUrl } from "../src/transport.ts";

const place = (id: string, name: string, address: string) => ({ id, name, address });
const t = () => Trip.parse({
  id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], tasks: [], travelers: [],
  places: [place("hotel", "Hotel Spree", "Exempelstraße 1, 10115 Berlin"), place("zoo", "Zoo Berlin", "Hardenbergplatz 8, 10787 Berlin"), place("museum", "Museum", "Bodestraße 1, 10178 Berlin")],
  bookings: [{ id: "h", name: "Hotel Spree", from: "2026-10-25", to: "2026-10-27", status: "ready", kind: "stay", placeId: "hotel" }],
  days: [{ id: "d1", date: "2026-10-26", title: "D", summary: "S.", icons: ["🦁"], start: "09:00", end: "18:00", activities: [
    { id: "a1", text: "Zoo", placeIds: ["zoo"], travel: { vehicle: "transit", durationMin: 30 } },
    { id: "a2", text: "Lunch", placeIds: [], travel: { vehicle: "walk", durationMin: 5 } },
    { id: "a3", text: "Museum", placeIds: ["museum"], travel: { vehicle: "car", durationMin: 15 } },
  ] }, { id: "d2", date: "2026-10-29", title: "E", summary: "S.", icons: ["🦁"], start: "09:00", end: "18:00", activities: [
    { id: "b1", text: "Museum igen", placeIds: ["museum"], travel: { vehicle: "train", durationMin: 20 } },
  ] }],
});
const params = (u?: string) => Object.fromEntries(new URL(u!).searchParams);

// REQ: TR-21 the first activity goes from the stay the night before, by public transport, to the activity's place
test("TR-21 from the stay", () => {
  const u = wayUrl(t(), "d1", "a1");
  assert.ok(u!.startsWith("https://www.google.com/maps/dir/?"));
  assert.deepEqual(params(u), { api: "1", origin: "Hotel Spree, Exempelstraße 1, 10115 Berlin", destination: "Zoo Berlin, Hardenbergplatz 8, 10787 Berlin", travelmode: "transit" });
});

// REQ: TR-21 later activities go from the nearest place before them on the day; the vehicle sets the mode
test("TR-21 from the place before", () => {
  assert.deepEqual(params(wayUrl(t(), "d1", "a3")), { api: "1", origin: "Zoo Berlin, Hardenbergplatz 8, 10787 Berlin", destination: "Museum, Bodestraße 1, 10178 Berlin", travelmode: "driving" });
  assert.equal(wayUrl(t(), "d1", "a2"), undefined, "no place: no link");
});

// REQ: TR-21 without a place before or a stay, Google Maps starts where the phone is; a train gives public transport
test("TR-21 without a start", () => {
  assert.deepEqual(params(wayUrl(t(), "d2", "b1")), { api: "1", destination: "Museum, Bodestraße 1, 10178 Berlin", travelmode: "transit" });
  assert.equal(wayUrl(t(), "d9", "a1"), undefined);
});
