import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingsOn, budgetStatus, dayHeading, defaultTab, pickDay, todayIn } from "../src/today.ts";

const days = [{ id: "d1", date: "2026-10-24" }, { id: "d2", date: "2026-10-25" }, { id: "d4", date: "2026-10-28" }];

// REQ: UP-01 the date of "today" is taken in the trip's time zone
test("UP-01 todayIn uses the trip time zone", () => {
  const now = new Date("2026-10-24T23:30:00Z");
  assert.equal(todayIn("Europe/Berlin", now), "2026-10-25");
  assert.equal(todayIn("America/New_York", now), "2026-10-24");
});

// REQ: UP-01 today while under way, else the nearest coming day, else the last day
test("UP-01 pickDay", () => {
  assert.equal(pickDay(days, "2026-10-25")?.id, "d2");
  assert.equal(pickDay(days, "2026-10-01")?.id, "d1");
  assert.equal(pickDay(days, "2026-10-27")?.id, "d4");
  assert.equal(pickDay(days, "2026-11-30")?.id, "d4");
  assert.equal(pickDay([], "2026-10-25"), undefined);
});

// REQ: MT-09 the tab follows the phase of the trip
test("MT-09 defaultTab", () => {
  assert.equal(defaultTab(days, "2026-10-20"), "nala");
  assert.equal(defaultTab(days, "2026-10-24"), "up");
  assert.equal(defaultTab(days, "2026-10-27"), "up");
  assert.equal(defaultTab(days, "2026-10-29"), "mi");
  assert.equal(defaultTab([], "2026-10-29"), "nala");
});

// REQ: UP-03 the heading shows weekday and date, with "Idag" for today
test("UP-03 dayHeading", () => {
  assert.equal(dayHeading("2026-10-24", "2026-10-24"), "Idag · lör 24 okt");
  assert.equal(dayHeading("2026-10-25", "2026-10-24"), "sön 25 okt");
});

// REQ: UP-05 bookings valid on the day, not cancelled, marked when they start that day
test("UP-05 bookingsOn", () => {
  const b = [
    { id: "hotel", from: "2026-10-25", to: "2026-10-28", status: "paid" },
    { id: "ferry", from: "2026-10-28", to: "2026-10-28", status: "ready" },
    { id: "old", from: "2026-10-25", to: "2026-10-26", status: "cancelled" },
  ] as const;
  assert.deepEqual(bookingsOn([...b], "2026-10-26").map((x) => [x.id, x.startsToday]), [["hotel", false]]);
  assert.deepEqual(bookingsOn([...b], "2026-10-28").map((x) => [x.id, x.startsToday]), [["hotel", false], ["ferry", true]]);
  assert.deepEqual(bookingsOn([...b], "2026-10-25").map((x) => [x.id, x.startsToday]), [["hotel", true]]);
});

// REQ: UP-06 budget status: planned, paid in advance, left to pay, spent during the trip
test("UP-06 budgetStatus", () => {
  const budget = [{ amount: 5200, paid: true }, { amount: 1900, paid: false }, { amount: 600, paid: true }];
  assert.deepEqual(budgetStatus(budget, [{ amount: 640 }, { amount: 180 }]), { planned: 7700, paid: 5800, left: 1900, spent: 820 });
});
