import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { placeView, confirmPlaceOps } from "../src/place.ts";
import { savePlace } from "../src/edit.ts";
import { travelText } from "../src/transport.ts";

const t = () => Trip.parse({
  id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], tasks: [], travelers: [], bookings: [], days: [],
  places: [{ id: "zoo", name: "Tierpark Hagenbeck", address: "Lokstedter Grenzstraße 2", notes: "Öppet 9–18", ai: true }, { id: "hem", name: "Hem", address: "Gatan 1" }],
});

// REQ: DQ-01 DQ-02 a place from the AI is shown as not checked until a Planerare confirms it or edits it by hand
test("DQ-01 an AI place is checked by a person", () => {
  assert.equal(placeView(t().places[0]!).unchecked, true);
  assert.equal(placeView(t().places[1]!).unchecked, false);
  const confirmed = Trip.parse(applyOps(t(), confirmPlaceOps(t(), "zoo")));
  assert.equal(confirmed.places[0]!.ai, undefined);
  assert.deepEqual(confirmPlaceOps(t(), "hem"), [], "nothing to confirm");
  const r = savePlace(t(), { name: "Tierpark Hagenbeck", address: "Lokstedter Grenzstraße 2, 22527 Hamburg", phone: "", notes: "Öppet 9–18", website: "", bookingUrl: "", bookingLabel: "" }, "zoo");
  assert.equal(Trip.parse(applyOps(t(), r.ok ? r.ops : [])).places[0]!.ai, undefined, "edited by hand");
});

// REQ: DQ-05 the way to an activity is an estimate and is shown with "ca"
test("DQ-05 travel time as an estimate", () => {
  assert.equal(travelText(30), "ca 30 min");
  assert.equal(travelText(90), "ca 1 h 30 min");
});
