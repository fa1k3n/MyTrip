import { test } from "node:test";
import assert from "node:assert/strict";
import { amountText, money } from "../src/budget.ts";

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
