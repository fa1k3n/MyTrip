import { test } from "node:test";
import assert from "node:assert/strict";
import { enqueue, unrated, withRate, withWaiting, type Expense } from "../src/offline.ts";
import { newExpense } from "../src/money.ts";
import { expenseAmountText } from "../src/currency.ts";
import { sv } from "../src/sv.ts";

const t = { travelers: [{ id: "anna", name: "Anna" }] };
const input = { text: "Glass", amount: "4,50", category: "Mat", paidBy: "anna", sharedBy: ["anna"], addedBy: "anna" };

// REQ: UP-49 without a rate the expense keeps the amount and currency as entered, to be converted when it is sent
test("UP-49 an expense without a rate", () => {
  const r = newExpense(t, { ...input, foreign: { currency: "EUR" } }, "2026-10-24", "2026-10-24T12:00:00.000Z", "e1");
  assert.ok(r.ok);
  const e = r.ops[0]!.value as Expense;
  assert.deepEqual(e.foreign, { amount: 4.5, currency: "EUR" });
  assert.ok(unrated(e));
  const rated = newExpense(t, { ...input, foreign: { currency: "EUR", rate: 11.2, rateDate: "2026-10-23" } }, "2026-10-24", "2026-10-24T12:00:00.000Z", "e2");
  assert.ok(rated.ok && !unrated(rated.ops[0]!.value as Expense), "an expense with a rate is ready to send");
});

// REQ: UP-49 when it is sent, the rate of its date converts the amount to the trip's currency (UP-25)
test("UP-49 withRate", () => {
  const e: Expense = { id: "e1", amount: 4.5, date: "2026-10-24", foreign: { amount: 4.5, currency: "EUR" } };
  assert.deepEqual(withRate(e, { rate: 11.23, date: "2026-10-23" }),
    { id: "e1", amount: 50.54, date: "2026-10-24", foreign: { amount: 4.5, currency: "EUR", rate: 11.23, rateDate: "2026-10-23" } });
});

// REQ: UP-49 until it has a rate it is shown in its own currency only and not counted in the budget (DQ-03)
test("UP-49 shown, not counted", () => {
  const e: Expense = { id: "e1", amount: 4.5, foreign: { amount: 4.5, currency: "EUR" } };
  assert.equal(expenseAmountText(e as Parameters<typeof expenseAmountText>[0], "SEK"), "4,50 €");
  const trip = withWaiting({ id: "berlin", expenses: [] as Expense[] }, enqueue(enqueue([], e, "berlin"), { id: "e2", amount: 30 }, "berlin"));
  assert.deepEqual(trip.expenses.map((x) => x.id), ["e2"]);
  assert.equal(sv.queue.noRate("EUR"), "Väntar på växelkursen för EUR.");
});
