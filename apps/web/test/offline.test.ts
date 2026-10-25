import { test } from "node:test";
import assert from "node:assert/strict";
import { dropAllCopies, dropCopy, keptForecast, loadCopy, offlineText, saveCopy, type Store } from "../src/offline.ts";

/** Local storage as a map, so the copies can be tested without a browser. */
function memory(): Store & { keys: () => string[] } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, keys: () => [...m.keys()],
  };
}
const anna = "person.berlin.anna.AbC_-1", skane = "person.skane.anna.Qq-2";

// REQ: PW-03 the last fetched trip is kept on the phone per link, so the app can start without a network
test("PW-03 a copy per link", () => {
  const s = memory();
  assert.equal(loadCopy(s, anna), null);
  saveCopy(s, anna, { me: { role: "traveler" }, trips: [{ id: "berlin" }] }, "2026-10-25T12:00:00.000Z");
  saveCopy(s, anna, { forecast: { d1: { t: 8 } } }, "2026-10-25T12:05:00.000Z");
  saveCopy(s, skane, { trips: [{ id: "skane" }] }, "2026-10-25T13:00:00.000Z");
  const c = loadCopy(s, anna)!;
  assert.deepEqual(c.trips, [{ id: "berlin" }]);
  assert.deepEqual(c.me, { role: "traveler" });
  assert.equal(c.at, "2026-10-25T12:00:00.000Z", "the time the trip was fetched, not the weather");
  assert.deepEqual(c.forecast, { d1: { t: 8 } });
  assert.equal(c.forecastAt, "2026-10-25T12:05:00.000Z");
  assert.deepEqual(loadCopy(s, skane)!.trips, [{ id: "skane" }], "each link has its own");
  s.setItem("mytrip.copy." + anna, "{broken");
  assert.equal(loadCopy(s, anna), null, "an unreadable copy is no copy");
});

// REQ: PW-17 removing a link removes its data; #admin removes every link's data
test("PW-17 copies are removed with their link", () => {
  const s = memory();
  saveCopy(s, anna, { trips: [] }, "2026-10-25T12:00:00.000Z");
  saveCopy(s, skane, { trips: [] }, "2026-10-25T12:00:00.000Z");
  s.setItem("mytrip.links", "[]");
  dropCopy(s, anna);
  assert.deepEqual(s.keys(), ["mytrip.copy." + skane, "mytrip.links"]);
  dropAllCopies(s);
  assert.deepEqual(s.keys(), ["mytrip.links"], "other settings stay");
});

// REQ: PW-04 the offline banner says when the trip was last fetched
test("PW-04 offlineText", () => {
  const now = new Date("2026-10-25T15:00:00.000Z");
  assert.equal(offlineText("2026-10-25T12:32:00.000Z", now, "Europe/Stockholm"), "Offline – senast uppdaterad 13.32");
  assert.equal(offlineText("2026-10-24T12:32:00.000Z", now, "Europe/Stockholm"), "Offline – senast uppdaterad 24 okt 14.32");
  assert.equal(offlineText(undefined, now, "Europe/Stockholm"), "Offline");
});

// REQ: PW-10 offline, the weather is the last fetched forecast of the same trip, with the time it was fetched
test("PW-10 keptForecast", () => {
  const c = { forecast: { tripId: "berlin", days: { d1: { t: 8 } } }, forecastAt: "2026-10-25T12:05:00.000Z" };
  assert.deepEqual(keptForecast(c, "berlin"), { days: { d1: { t: 8 } }, at: "2026-10-25T12:05:00.000Z" });
  assert.equal(keptForecast(c, "skane"), null, "another trip's weather is not shown");
  assert.equal(keptForecast(null, "berlin"), null);
  assert.equal(keptForecast({ forecast: { tripId: "berlin", days: {} } }, "berlin"), null, "no time, no weather");
});

// REQ: PW-05 offline, everything the link received stays readable: the copy is the trip as the server sent it
test("PW-05 the copy keeps the whole trip", () => {
  const s = memory();
  const trip = { id: "berlin", days: [{ id: "d1", activities: [{ id: "a", text: "Zoo" }] }], bookings: [{ id: "h", name: "Hotel", reference: "XY-1" }],
    budget: [{ id: "b", category: "Mat", amount: 300 }], info: [{ id: "i", title: "Nödnummer", text: "112" }] };
  saveCopy(s, anna, { trips: [trip] }, "2026-10-25T12:00:00.000Z");
  assert.deepEqual(loadCopy(s, anna)!.trips, [trip]);
});
