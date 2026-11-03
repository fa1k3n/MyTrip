import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { bookingForm, saveBooking, saveBudgetItem, type BookingInput } from "../src/edit.ts";
import { amountText, budgetPlan } from "../src/budget.ts";

const t = () => Trip.parse({
  id: "t", revision: 3, title: "T", timezone: "Europe/Berlin", currency: "SEK", stops: [], places: [], tasks: [], travelers: [],
  days: [{ id: "d1", date: "2027-11-01", title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [] }],
  bookings: [{ id: "hotell", name: "Hotel Am Beispielkai", from: "2027-11-01", to: "2027-11-05", status: "ready", kind: "stay" }],
  budget: [],
});
const input = (x: Partial<BookingInput> = {}): BookingInput => ({ ...bookingForm(t(), t().bookings[0]), ...x });
const apply = (trip: Trip, r: ReturnType<typeof saveBooking>) => { assert.ok(r.ok); return Trip.parse(applyOps(trip, r.ok ? r.ops : [])); };

// REQ: BK-25 BG-07 a price in another currency is saved with the rate of the day it was saved and counted in the trip's currency
test("BK-25 a booking's price in another currency counts with its rate", () => {
  const trip = apply(t(), saveBooking(t(), input({ price: "1240", currency: "EUR", rate: { rate: 11.5, date: "2026-11-03" } }), "hotell"));
  const item = trip.budget.find((i) => i.bookingId === "hotell")!;
  assert.deepEqual([item.amount, item.currency, item.rate, item.rateDate], [1240, "EUR", 11.5, "2026-11-03"]);
  const plan = budgetPlan(trip);
  assert.equal(plan.rows.find((r) => r.category === "Boende")?.planned, 14260);
  assert.equal(plan.planned, 14260);
  assert.equal(amountText(item, "SEK").replace(/\s/g, " "), "1 240 € (ca 14 260 kr)");
});

// REQ: BK-25 BG-07 without a rate the item is listed but not counted; the trip's own currency needs none
test("BK-25 no rate: listed, not counted", () => {
  const trip = apply(t(), saveBooking(t(), input({ price: "1240", currency: "EUR" }), "hotell"));
  const item = trip.budget[0]!;
  assert.equal(item.rate, undefined);
  assert.equal(budgetPlan(trip).planned, 0);
  assert.equal(amountText(item, "SEK").replace(/\s/g, " "), "1 240 €");
  const sek = apply(t(), saveBooking(t(), input({ price: "900", currency: "SEK", rate: { rate: 2, date: "2026-11-03" } }), "hotell"));
  assert.equal(sek.budget[0]!.rate, undefined, "no rate in the trip's currency");
  assert.equal(budgetPlan(sek).planned, 900);
});

// REQ: BK-25 saving again in the same currency without a new rate keeps the old one
test("BK-25 the rate is kept when none could be fetched", () => {
  const first = apply(t(), saveBooking(t(), input({ price: "1240", currency: "EUR", rate: { rate: 11.5, date: "2026-11-03" } }), "hotell"));
  const again = apply(first, saveBooking(first, { ...bookingForm(first, first.bookings[0]), price: "1300" }, "hotell"));
  assert.deepEqual([again.budget[0]!.amount, again.budget[0]!.rate], [1300, 11.5]);
  const other = apply(first, saveBooking(first, { ...bookingForm(first, first.bookings[0]), currency: "USD" }, "hotell"));
  assert.equal(other.budget[0]!.rate, undefined, "another currency: the old rate does not apply");
});

// REQ: BG-07 a budget item entered in another currency is counted with the rate fetched when it is saved
test("BG-07 a budget item with a rate", () => {
  const f = { category: "Mat", amount: "100", paid: false, owner: "", estimate: false, amountMax: "", currency: "EUR", note: "" };
  const trip = apply(t(), saveBudgetItem(t(), { ...f, rate: { rate: 11.5, date: "2026-11-03" } }));
  assert.deepEqual([trip.budget[0]!.rate, trip.budget[0]!.rateDate], [11.5, "2026-11-03"]);
  assert.equal(budgetPlan(trip).planned, 1150);
  const kept = apply(trip, saveBudgetItem(trip, { ...f, amount: "200" }, trip.budget[0]!.id));
  assert.equal(budgetPlan(kept).planned, 2300);
});
