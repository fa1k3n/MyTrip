import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityTime, anyOpen, bookingDates, budgetByCategory, dateBadge, dayTime, excerpt, jumpTo, kr, paidTotal,
  routeLabel, scrollBehavior, timelineStops, toggleAll, toggleAllLabel, toggleOne, tripDates, vehicleIcons,
} from "../src/format.ts";

const day = (id: string, date: string, extra: object = {}) =>
  ({ id, date, title: "t", summary: "s", icons: ["🚗"], start: "09:00", end: "18:00", estimated: false, legs: [], activities: [], ...extra });

// REQ: DC-02 the date badge shows the day of the month and the Swedish weekday abbreviation
test("DC-02 dateBadge", () => {
  assert.deepEqual(dateBadge("2026-10-24"), { d: "24", w: "lör" });
  assert.deepEqual(dateBadge("2026-10-26"), { d: "26", w: "mån" });
  assert.deepEqual(dateBadge("2026-11-01"), { d: "1", w: "sön" });
});

// REQ: TM-01 TM-02 day times use HH.MM and "ca" marks estimates per end
test("TM-01 TM-02 dayTime", () => {
  assert.equal(dayTime(day("a", "2026-10-24")), "09.00–18.00");
  assert.equal(dayTime(day("a", "2026-10-24", { start: "08:30", end: "17:00", endEstimated: true })), "08.30–ca 17.00");
  assert.equal(dayTime(day("a", "2026-10-24", { estimated: true })), "ca 09.00–ca 18.00");
});

// REQ: TM-05 activity times show "ca" when estimated
test("TM-05 activityTime", () => {
  assert.equal(activityTime({ start: "09:00", estimated: false }), "09.00");
  assert.equal(activityTime({ start: "12:00", estimated: true }), "ca 12.00");
  assert.equal(activityTime({ estimated: false }), "");
});

// REQ: LC-03 amounts use Swedish grouping
test("LC-03 kr", () => {
  assert.equal(kr(5200), "5 200 kr");
  assert.equal(kr(600), "600 kr");
});

// REQ: MT-04 trip dates come from the days, a label overrides them, and a placeholder covers neither
test("MT-04 tripDates", () => {
  assert.equal(tripDates({ days: [day("a", "2026-10-28"), day("b", "2026-10-24")] }), "24 okt – 28 okt 2026");
  assert.equal(tripDates({ days: [], dateLabel: "jul 2026 · avslutad" }), "jul 2026 · avslutad");
  assert.equal(tripDates({ days: [] }), "Datum saknas");
});

// REQ: MT-01 the hub card shows the first 70 characters of the purpose
test("MT-01 excerpt", () => {
  assert.equal(excerpt("Strand, glass och cykling."), "Strand, glass och cykling.…");
  assert.equal(excerpt("x".repeat(80)), "x".repeat(70) + "…");
  assert.equal(excerpt(""), "Skriv syftet med resan här.…");
});

// REQ: BK-01 booking dates as a compact range
test("BK-01 bookingDates", () => {
  assert.equal(bookingDates({ from: "2026-10-25", to: "2026-10-28" }), "25–28 okt");
  assert.equal(bookingDates({ from: "2026-10-28", to: "2026-10-28" }), "28 okt");
  assert.equal(bookingDates({ from: "2026-10-30", to: "2026-11-02" }), "30 okt – 2 nov");
});

// REQ: TR-02 vehicles are shown as icons only, once each, in leg order
test("TR-02 vehicleIcons", () => {
  const legs = [{ vehicle: "car" }, { vehicle: "ferry" }, { vehicle: "car" }] as const;
  assert.equal(vehicleIcons({ legs: [...legs] }), "🚗🚢");
  assert.equal(vehicleIcons({ legs: [{ vehicle: "transit" }, { vehicle: "walk" }, { vehicle: "train" }] }), "🚇🚶🚆");
  assert.equal(vehicleIcons({ legs: [] }), "");
});

// REQ: MT-06 the overview route lists each day location once, in order
test("MT-06 routeLabel", () => {
  const days = [day("a", "2026-10-24", { location: "Köpenhamn" }), day("b", "2026-10-25", { location: "Berlin" }), day("c", "2026-10-26", { location: "Berlin" }), day("d", "2026-10-27")];
  assert.equal(routeLabel(days), "Köpenhamn → Berlin");
});

// REQ: OV-01 OV-03 timeline stops are ordered by the date of their linked day
test("OV-01 OV-03 timelineStops", () => {
  const trip = {
    days: [day("d1", "2026-10-24"), day("d2", "2026-10-25")],
    stops: [{ label: "Berlin", sub: "25 sön", dayId: "d2" }, { label: "Köpenhamn", sub: "24 lör", dayId: "d1" }, { label: "?", sub: "", dayId: "gone" }],
  };
  assert.deepEqual(timelineStops(trip).map((s) => s.label), ["Köpenhamn", "Berlin"]);
});

// REQ: BG-04 the paid subtotal sums paid items only
test("BG-04 paidTotal", () => {
  const items = [
    { category: "Boende", amount: 5200, paid: true }, { category: "Transport", amount: 2300, paid: true },
    { category: "Transport", amount: 1900, paid: false }, { category: "Mat/Fritid", amount: 3000, paid: false },
    { category: "Övrigt", amount: 600, paid: true },
  ];
  assert.equal(paidTotal(items), 8100);
  // REQ: BG-09 the chart groups every item per category, in first-seen order
  assert.deepEqual(budgetByCategory(items), [["Boende", 5200], ["Transport", 4200], ["Mat/Fritid", 3000], ["Övrigt", 600]]);
});

// REQ: DC-03 DC-09 DC-10 DC-11 expand state
test("DC-03 DC-09 DC-10 DC-11 expand and collapse", () => {
  const ids = ["d1", "d2"];
  let open = {};
  assert.equal(anyOpen(open), false); // DC-03 collapsed on first load
  assert.equal(toggleAllLabel(open), "Visa alla dagar");
  open = toggleOne(open, "d1"); // DC-09
  assert.deepEqual(open, { d1: true });
  assert.equal(toggleAllLabel(open), "Fäll ihop alla"); // DC-11 updates after a single toggle
  open = toggleAll(open, ids); // DC-10 at least one open -> collapse all
  assert.equal(anyOpen(open), false);
  open = toggleAll(open, ids); // all collapsed -> expand all
  assert.deepEqual(open, { d1: true, d2: true });
  open = toggleOne(open, "d2");
  assert.deepEqual(open, { d1: true, d2: false });
});

// REQ: OV-04 activating a stop expands only the linked day
test("OV-04 jumpTo", () => {
  assert.deepEqual(jumpTo("d2"), { d2: true });
});

// REQ: OV-05 AC-06 reduced motion gives an instant scroll
test("OV-05 AC-06 scrollBehavior", () => {
  assert.equal(scrollBehavior(true), "auto");
  assert.equal(scrollBehavior(false), "smooth");
});
