import { test } from "node:test";
import assert from "node:assert/strict";
import { amountText, budgetRows, money } from "../src/budget.ts";

// REQ: LC-03 BG-07 amounts in their own currency with Swedish separators
test("LC-03 BG-07 money", () => {
  assert.equal(money(2149.2, "SEK"), "2 149,20 kr");
  assert.equal(money(135.9, "EUR"), "135,90 €");
  assert.equal(money(43, "EUR"), "43 €");
  assert.equal(money(500, "DKK"), "500 DKK");
});

// REQ: BG-03 BG-06 DQ-05 estimates and unknown amounts are described in words
test("BG-03 BG-06 DQ-05 amountText", () => {
  assert.equal(amountText({ amount: 2518, paid: true }, "SEK"), "2 518 kr");
  assert.equal(amountText({ amount: 75, amountMax: 100, estimate: true, currency: "EUR", paid: false }, "SEK"), "ca 75–100 €");
  assert.equal(amountText({ amount: 43, estimate: true, currency: "EUR", paid: false }, "SEK"), "ca 43 €");
  assert.equal(amountText({ estimate: true, paid: false }, "SEK"), "ej kollat");
});

// REQ: BG-04 BG-05 BG-06 BG-07 paid items first with a subtotal per currency; estimates and unknown amounts are left out of it
test("BG-04 BG-05 BG-06 BG-07 budgetRows", () => {
  const items = [
    { id: "a", amount: 2149.2, paid: true }, { id: "b", amount: 5161.24, paid: true }, { id: "c", amount: 2518, paid: true },
    { id: "d", amount: 135.9, currency: "EUR", paid: true }, { id: "e", amount: 20, currency: "EUR", paid: true },
    { id: "f", amount: 75, amountMax: 100, currency: "EUR", estimate: true, paid: false },
    { id: "g", estimate: true, paid: false },
    { id: "h", amount: 300, paid: false },
  ];
  const r = budgetRows(items, "SEK");
  assert.deepEqual(r.paid.map((x) => x.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(r.totals, [{ currency: "SEK", sum: 9828.44 }, { currency: "EUR", sum: 155.9 }]);
  assert.deepEqual(r.other.map((x) => x.id), ["f", "g", "h"]);
});
