import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { removeBooking, removeBudgetItem, removeDay, removeActivity, saveActivity, saveBooking, saveBudgetItem, saveDay, saveTrip, splitIcons, uniqueId } from "../src/edit.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin",
  stops: [{ label: "Köpenhamn", sub: "24 lör", dayId: "day-1" }],
  days: [{ id: "day-1", date: "2026-10-24", title: "Helsingborg → Köpenhamn", summary: "Färjan.", icons: ["🚢"], start: "09:00", end: "18:00", location: "Köpenhamn",
    weather: { lat: 55.68, lon: 12.57 }, legs: [{ vehicle: "ferry", origin: "A", destination: "B" }],
    activities: [{ id: "a-1", text: "Lunch", placeIds: [], start: "12:00", estimated: true }] }],
  places: [{ id: "nyhavn", name: "Nyhavn", address: "Nyhavn 17, Köpenhamn" }],
  bookings: [{ id: "hotel", name: "Hotel", from: "2026-10-24", to: "2026-10-24", status: "paid", reference: "X1", note: "Fri avbokning" }],
  tasks: [], travelers: [], budget: [{ id: "bg-1", category: "Boende", amount: 5200, paid: true, owner: "Anna" }],
});
const run = (t: Trip, r: ReturnType<typeof saveDay>) => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return Trip.parse(applyOps(t, r.ok ? r.ops : []));
};
const day = { date: "2026-10-25", title: "Köpenhamn → Berlin", summary: "Bilen söderut.", icons: "🚗🚢", start: "08:30", end: "17:00", startEstimated: false, endEstimated: true, location: "Berlin" };

// REQ: ED-08 readable ids that are unique within the trip
test("ED-08 uniqueId", () => {
  assert.equal(uniqueId("Lunch på Torvehallerne", []), "lunch-pa-torvehallerne");
  assert.equal(uniqueId("Hotel", ["hotel", "hotel-2"]), "hotel-3");
  assert.equal(uniqueId("!!!", []), "x");
});

// REQ: ED-02 icons are split into whole emoji
test("ED-02 splitIcons", () => {
  assert.deepEqual(splitIcons("🚗🚢"), ["🚗", "🚢"]);
  assert.deepEqual(splitIcons(" 🏛️ 🍽️ "), ["🏛️", "🍽️"]);
});

// REQ: ED-01 title and purpose
test("ED-01 saveTrip", () => {
  const t = run(trip(), saveTrip(trip(), { title: " Höstlov ", purpose: "Lugna dagar." }));
  assert.deepEqual([t.title, t.purpose], ["Höstlov", "Lugna dagar."]);
  assert.equal(saveTrip(trip(), { title: " ", purpose: "" }).ok, false);
});

// REQ: ED-02 ED-03 a new day is added with its timeline stop
test("ED-02 ED-03 saveDay adds a day and its stop", () => {
  const t = run(trip(), saveDay(trip(), { ...day, weather: { lat: 52.52, lon: 13.4 } }));
  const d = t.days.find((x) => x.date === "2026-10-25")!;
  assert.equal(d.id, "day-2026-10-25");
  assert.deepEqual(d.icons, ["🚗", "🚢"]);
  assert.deepEqual([d.endEstimated, d.startEstimated, d.location], [true, false, "Berlin"]);
  assert.deepEqual(d.weather, { lat: 52.52, lon: 13.4 });
  assert.deepEqual(t.stops.find((s) => s.dayId === d.id), { label: "Berlin", sub: "25 sön", dayId: d.id });
});

// REQ: ED-02 ED-03 ED-04 changing a day keeps activities, legs and weather, and updates its stop
test("ED-02 ED-03 ED-04 saveDay changes a day", () => {
  const t = run(trip(), saveDay(trip(), { ...day, date: "2026-10-24", location: "" }, "day-1"));
  assert.equal(t.days.length, 1);
  const d = t.days[0];
  assert.deepEqual([d.title, d.activities.length, d.legs.length], ["Köpenhamn → Berlin", 1, 1]);
  assert.deepEqual(d.weather, { lat: 55.68, lon: 12.57 }); // weather undefined: keep
  assert.deepEqual(t.stops, [{ label: "Köpenhamn → Berlin", sub: "24 lör", dayId: "day-1" }]);
  const cleared = run(trip(), saveDay(trip(), { ...day, date: "2026-10-24", weather: null }, "day-1"));
  assert.equal(cleared.days[0].weather, undefined); // null: the place lookup failed or the place was removed
});

// REQ: ED-02 invalid days are rejected
test("ED-02 saveDay validation", () => {
  for (const bad of [
    { ...day, date: "" }, { ...day, title: " " }, { ...day, summary: "" }, { ...day, icons: "" }, { ...day, icons: "🚗🚢🏛️" },
    { ...day, start: "" }, { ...day, start: "18:00", end: "09:00" }, { ...day, date: "2026-10-24" },
  ]) assert.equal(saveDay(trip(), bad).ok, false, JSON.stringify(bad));
});

// REQ: ED-03 removing a day removes its stop
test("ED-03 removeDay", () => {
  const t = Trip.parse(applyOps(trip(), removeDay(trip(), "day-1")));
  assert.deepEqual([t.days.length, t.stops.length], [0, 0]);
});

// REQ: ED-05 activities: new place, time order, untimed last
test("ED-05 saveActivity", () => {
  let t = run(trip(), saveActivity(trip(), "day-1", { start: "", estimated: false, text: "Promenad", place: { kind: "none" } }));
  t = run(t, saveActivity(t, "day-1", { start: "09:00", estimated: false, text: "Färja", place: { kind: "new", name: "Helsingör terminal", address: "Helsingör" } }));
  assert.deepEqual(t.days[0].activities.map((a) => a.text), ["Färja", "Lunch", "Promenad"]);
  const ferry = t.days[0].activities[0];
  assert.deepEqual(ferry.placeIds, ["helsingor-terminal"]);
  assert.equal(t.places.find((p) => p.id === "helsingor-terminal")?.address, "Helsingör");
  t = run(t, saveActivity(t, "day-1", { start: "13:00", estimated: true, text: "Lunch på Nyhavn", place: { kind: "existing", id: "nyhavn" } }, "a-1"));
  const lunch = t.days[0].activities.find((a) => a.id === "a-1")!;
  assert.deepEqual([lunch.text, lunch.start, lunch.estimated, lunch.placeIds], ["Lunch på Nyhavn", "13:00", true, ["nyhavn"]]);
  assert.equal(saveActivity(t, "day-1", { start: "", estimated: false, text: " ", place: { kind: "none" } }).ok, false);
  assert.equal(saveActivity(t, "day-1", { start: "", estimated: false, text: "X", place: { kind: "new", name: "", address: "" } }).ok, false);
  t = Trip.parse(applyOps(t, removeActivity(t, "day-1", "a-1")));
  assert.ok(!t.days[0].activities.some((a) => a.id === "a-1"));
});

// REQ: ED-06 bookings keep fields the form does not show
test("ED-06 saveBooking", () => {
  let t = run(trip(), saveBooking(trip(), { name: "Hotel", from: "2026-10-24", to: "2026-10-24", status: "ready", reference: "", placeId: "nyhavn" }, "hotel"));
  const b = t.bookings[0];
  assert.deepEqual([b.status, b.reference, b.placeId, b.note], ["ready", undefined, "nyhavn", "Fri avbokning"]);
  t = run(t, saveBooking(t, { name: "Hotel", from: "2026-10-24", to: "2026-10-24", status: "paid", reference: "Y", placeId: "" }));
  assert.deepEqual(t.bookings.map((x) => x.id), ["hotel", "hotel-2"]);
  assert.equal(saveBooking(t, { name: "B", from: "2026-10-25", to: "2026-10-24", status: "paid", reference: "", placeId: "" }).ok, false);
  t = Trip.parse(applyOps(t, removeBooking(t, "hotel")));
  assert.deepEqual(t.bookings.map((x) => x.id), ["hotel-2"]);
});

// REQ: ED-07 budget items
test("ED-07 saveBudgetItem", () => {
  let t = run(trip(), saveBudgetItem(trip(), { category: "Mat/Fritid", amount: "1 250,50", paid: false, owner: "Erik" }));
  assert.deepEqual(t.budget[1], { id: "mat-fritid", category: "Mat/Fritid", amount: 1250.5, paid: false, owner: "Erik" });
  t = run(t, saveBudgetItem(t, { category: "Boende", amount: "5400", paid: true, owner: "" }, "bg-1"));
  assert.deepEqual(t.budget[0], { id: "bg-1", category: "Boende", amount: 5400, paid: true });
  assert.equal(saveBudgetItem(t, { category: "Boende", amount: "abc", paid: true, owner: "" }).ok, false);
  t = Trip.parse(applyOps(t, removeBudgetItem(t, "bg-1")));
  assert.deepEqual(t.budget.map((x) => x.id), ["mat-fritid"]);
});
