import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Expense, Trip } from "@trip/schema";
import { currencyFor, dayCountry, expenseAmountText, parseCountry, parseRate, rateUrl } from "../src/currency.ts";
import { newExpense } from "../src/money.ts";
import { saveDay } from "../src/edit.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "t", timezone: "Europe/Berlin", stops: [], places: [], bookings: [], tasks: [], budget: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }],
  days: [{ id: "day-1", date: "2026-10-24", title: "Köpenhamn", summary: "s", icons: ["🚢"], start: "09:00", end: "18:00", activities: [] }],
});

// REQ: UP-23 the currency of the day's country, else the trip's
test("UP-23 currencyFor", () => {
  assert.equal(currencyFor("DE", "SEK"), "EUR");
  assert.equal(currencyFor("DK", "SEK"), "DKK");
  assert.equal(currencyFor("NO", "SEK"), "NOK");
  assert.equal(currencyFor("SE", "EUR"), "SEK");
  assert.equal(currencyFor("GB", "SEK"), "GBP");
  assert.equal(currencyFor(undefined, "SEK"), "SEK");
  assert.equal(currencyFor("XX", "SEK"), "SEK"); // unknown country
});

// REQ: UP-24 the country from the place lookup, on the day or kept on the device
test("UP-24 parseCountry, saveDay and dayCountry", () => {
  assert.equal(parseCountry({ results: [{ latitude: 52.52, longitude: 13.4, country_code: "de" }] }), "DE");
  assert.equal(parseCountry({ results: [{ latitude: 52.52, longitude: 13.4 }] }), undefined);
  assert.equal(parseCountry({}), undefined);
  const day = { date: "2026-10-24", title: "Berlin", summary: "s", icons: "🚢", start: "09:00", end: "18:00", startEstimated: false, endEstimated: false, location: "Berlin" };
  const r = saveDay(trip(), { ...day, weather: { lat: 52.52, lon: 13.4 }, country: "DE" }, "day-1");
  assert.ok(r.ok);
  const t = Trip.parse(applyOps(trip(), r.ok ? r.ops : []));
  assert.equal(t.days[0].country, "DE");
  const kept = saveDay(t, { ...day, title: "Berlin igen" }, "day-1"); // same location: the country stays
  assert.equal(Trip.parse(applyOps(t, kept.ok ? kept.ops : [])).days[0].country, "DE");
  const gone = saveDay(t, { ...day, location: "", weather: null, country: null }, "day-1");
  assert.equal(Trip.parse(applyOps(t, gone.ok ? gone.ops : [])).days[0].country, undefined);
  assert.equal(dayCountry({ location: "Berlin", country: "DE" }, {}), "DE");
  assert.equal(dayCountry({ location: "Köpenhamn" }, { "Köpenhamn": "DK" }), "DK"); // looked up on the device
  assert.equal(dayCountry({ location: "Köpenhamn" }, {}), undefined);
  assert.equal(dayCountry({}, { "": "DK" }), undefined);
});

// REQ: UP-25 the rate of the expense's date, the amount converted to the trip's currency
test("UP-25 rateUrl, parseRate and a converted expense", () => {
  assert.equal(rateUrl("EUR", "SEK", "2026-10-25"), "https://api.frankfurter.dev/v1/2026-10-25?from=EUR&to=SEK");
  assert.deepEqual(parseRate({ amount: 1, base: "EUR", date: "2026-10-23", rates: { SEK: 11.23 } }, "SEK"), { rate: 11.23, date: "2026-10-23" });
  assert.equal(parseRate({ rates: {} }, "SEK"), null);
  assert.equal(parseRate(null, "SEK"), null);
  const r = newExpense(trip(), { text: "Lunch", amount: "28,50", category: "Mat/Fritid", paidBy: "anna", sharedBy: ["anna"], addedBy: "anna",
    foreign: { currency: "EUR", rate: 11.23, rateDate: "2026-10-23" } }, "2026-10-25", "2026-10-25T12:00:00.000Z", "exp-1");
  assert.ok(r.ok);
  const e = Expense.parse(r.ok ? r.ops[0].value : {});
  assert.equal(e.amount, 320.06); // 28.50 × 11.23 = 320.055, rounded to öre
  assert.deepEqual(e.foreign, { amount: 28.5, currency: "EUR", rate: 11.23, rateDate: "2026-10-23" });
  const home = newExpense(trip(), { text: "Glass", amount: "60", category: "Mat/Fritid", paidBy: "anna", sharedBy: ["anna"], addedBy: "anna" }, "2026-10-25", "2026-10-25T12:00:00.000Z", "exp-2");
  assert.equal(home.ok && "foreign" in (home.ops[0].value as object), false);
});

// REQ: UP-26 the own amount first, then the amount in the trip's currency
test("UP-26 expenseAmountText", () => {
  assert.equal(expenseAmountText({ amount: 320.06, foreign: { amount: 28.5, currency: "EUR", rate: 11.23, rateDate: "2026-10-23" } }, "SEK"), "28,50 € (320,06 kr)");
  assert.equal(expenseAmountText({ amount: 150, foreign: { amount: 100, currency: "DKK", rate: 1.5, rateDate: "2026-10-23" } }, "SEK"), "100 DKK (150 kr)");
  assert.equal(expenseAmountText({ amount: 60 }, "SEK"), "60 kr");
});
