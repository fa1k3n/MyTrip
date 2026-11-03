import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptFill } from "../src/format.ts";
import { parseAmount } from "../src/money.ts";

// REQ: AI-42 what the receipt gave fills the expense form: amount as typed in Swedish, a known currency, text, category, date
test("AI-42 a reading as the form's values", () => {
  const f = receiptFill({ amount: 23.8, currency: "EUR", date: "2026-10-25", text: "Lunch", category: "Mat" }, ["SEK", "EUR"]);
  assert.deepEqual(f, { amount: "23,80", currency: "EUR", date: "2026-10-25", text: "Lunch", category: "Mat" });
  assert.equal(parseAmount(f.amount!), 23.8);
  assert.deepEqual(receiptFill({ amount: 1200, currency: "XYZ" }, ["SEK"]), { amount: "1200" }); // a currency the form lacks is left out
  assert.deepEqual(receiptFill({}, ["SEK"]), {});
});
