import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { bookingForm, readingToForm, removeBooking, saveBooking, type BookingInput } from "../src/edit.ts";
import { budgetPlan } from "../src/budget.ts";

const t = () => Trip.parse({
  id: "t", revision: 3, title: "T", timezone: "Europe/Stockholm", currency: "SEK", stops: [], places: [], tasks: [], travelers: [],
  days: [{ id: "d1", date: "2026-10-25", title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [] }],
  bookings: [{ id: "hotell", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-26", status: "ready", kind: "stay" }],
  budget: [{ id: "mat", category: "Mat", paid: false, amount: 500 }],
});
const input = (x: Partial<BookingInput> = {}): BookingInput => ({ ...bookingForm(t(), t().bookings[0]), ...x });
const apply = (trip: Trip, r: ReturnType<typeof saveBooking>) => { assert.ok(r.ok); return Trip.parse(applyOps(trip, r.ok ? r.ops : [])); };

// REQ: BK-25 a price read from a confirmation fills in the form's price and currency
test("BK-25 a reading fills in the price", () => {
  const f = readingToForm(input(), { price: { value: 1250.5, currency: "EUR" } });
  assert.equal(f.price, "1250,50");
  assert.equal(f.currency, "EUR");
  assert.equal(input().price, "", "no budget item: no price");
  assert.equal(input().currency, "SEK", "the trip's currency by default");
});

// REQ: BK-25 saving with a price adds the booking's own budget item with name, amount, currency, paid from the status and category from the kind
test("BK-25 the price becomes a budget item", () => {
  const trip = apply(t(), saveBooking(t(), input({ price: "1 250", status: "paid" }), "hotell"));
  const item = trip.budget.find((i) => i.bookingId === "hotell");
  assert.deepEqual(item && { ...item, id: "x" }, { id: "x", bookingId: "hotell", category: "Boende", note: "Hotell Kusten", amount: 1250, currency: "SEK", paid: true });
  const cat = (kind: BookingInput["kind"]) => apply(t(), saveBooking(t(), input({ name: "X", kind, price: "10" }))).budget.find((i) => i.bookingId)?.category;
  assert.equal(cat("ticket"), "Upplevelse");
  assert.equal(cat("transport"), "Transport");
  assert.equal(cat("other"), "Övrigt");
  assert.equal(apply(t(), saveBooking(t(), input({ name: "Ny", price: "10" }))).budget.find((i) => i.bookingId)?.bookingId, "ny", "a new booking's own id");
  assert.equal(apply(t(), saveBooking(t(), input(), "hotell")).budget.length, 1, "no price: no budget item");
  assert.ok(!saveBooking(t(), input({ price: "gratis" }), "hotell").ok, "a price that is not an amount");
});

// REQ: BK-25 saving again updates the item but keeps an edited category; clearing the price or removing the booking removes it
test("BK-25 updating and removing the budget item", () => {
  let trip = apply(t(), saveBooking(t(), input({ price: "1250" }), "hotell"));
  const i = trip.budget.findIndex((x) => x.bookingId === "hotell");
  trip = Trip.parse(applyOps(trip, [{ op: "set", path: `budget/${i}/category`, value: "Mat" }]));
  assert.equal(bookingForm(trip, trip.bookings[0]).price, "1250", "the form shows the item's price");
  trip = apply(trip, saveBooking(trip, { ...bookingForm(trip, trip.bookings[0]), name: "Hotell Kusten Spa", price: "1400", currency: "EUR", status: "paid" }, "hotell"));
  assert.deepEqual(trip.budget.filter((x) => x.bookingId).map((x) => [x.category, x.note, x.amount, x.currency, x.paid]), [["Mat", "Hotell Kusten Spa", 1400, "EUR", true]]);
  const cleared = apply(trip, saveBooking(trip, { ...bookingForm(trip, trip.bookings[0]), price: "" }, "hotell"));
  assert.deepEqual(cleared.budget.map((x) => x.id), ["mat"]);
  const removed = Trip.parse(applyOps(trip, removeBooking(trip, "hotell")));
  assert.deepEqual(removed.budget.map((x) => x.id), ["mat"]);
  assert.equal(removed.bookings.length, 0);
});

// REQ: BK-05 a cancelled booking's budget item is not counted in plan, utfall or prognos
test("BK-05 a cancelled booking is not counted", () => {
  const trip = apply(t(), saveBooking(t(), input({ price: "1000", status: "paid" }), "hotell"));
  assert.equal(budgetPlan(trip).planned, 1500);
  assert.equal(budgetPlan(trip).actual, 1000);
  const off = apply(trip, saveBooking(trip, { ...bookingForm(trip, trip.bookings[0]), status: "cancelled" }, "hotell"));
  assert.equal(budgetPlan(off).planned, 500);
  assert.equal(budgetPlan(off).actual, 0);
  assert.equal(budgetPlan(off).forecast, 500);
  assert.equal(off.budget.length, 2, "the item stays, marked by its booking");
});
