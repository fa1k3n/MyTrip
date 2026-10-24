import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceText, balances, budgetVsActual, parseAmount, settle, sharedByValue } from "../src/money.ts";

const people = [{ id: "a", name: "Anna" }, { id: "b", name: "Erik" }, { id: "c", name: "Lisa" }];

// REQ: MI-03 amounts accept comma or point and reject invalid values
test("MI-03 parseAmount", () => {
  assert.equal(parseAmount("640,50"), 640.5);
  assert.equal(parseAmount(" 1 200.25 "), 1200.25);
  assert.equal(parseAmount("12"), 12);
  for (const bad of ["", "abc", "0", "-5", "1,2,3"]) assert.ok(Number.isNaN(parseAmount(bad)), bad);
});

// REQ: MI-02 everyone selected is stored as "shared by all"
test("MI-02 sharedByValue", () => {
  assert.deepEqual(sharedByValue(["c", "a", "b"], ["a", "b", "c"]), []);
  assert.deepEqual(sharedByValue(["a", "c"], ["a", "b", "c"]), ["a", "c"]);
});

// REQ: MI-04 balances split in whole öre and sum to zero
test("MI-04 balances split in öre and sum to zero", () => {
  const bal = balances(people, [{ amount: 100, paidBy: "a", sharedBy: [] }], []);
  assert.deepEqual(bal, { a: 66.66, b: -33.33, c: -33.33 }); // Anna's own share takes the extra öre
  assert.equal(Math.round(Object.values(bal).reduce((x, y) => x + y, 0) * 100), 0);
});

// REQ: MI-04 only the named sharers carry the cost, and payments move the balance
test("MI-04 balances with sharers and payments", () => {
  const bal = balances(people, [{ amount: 300, paidBy: "b", sharedBy: ["a", "b"] }], [{ from: "a", to: "b", amount: 100 }]);
  assert.deepEqual(bal, { a: -50, b: 50, c: 0 });
});

// REQ: MI-05 the proposed transfers settle every balance with few transfers
test("MI-05 settle", () => {
  assert.deepEqual(settle({ a: 66.66, b: -33.33, c: -33.33 }), [
    { from: "b", to: "a", amount: 33.33 },
    { from: "c", to: "a", amount: 33.33 },
  ]);
  const bal = { a: 500, b: -200, c: -300, d: 0 };
  const t = settle(bal);
  assert.ok(t.length <= 2);
  const after: Record<string, number> = { ...bal };
  for (const x of t) { after[x.from] += x.amount; after[x.to] -= x.amount; }
  assert.ok(Object.values(after).every((v) => Math.abs(v) < 0.005));
  assert.deepEqual(settle({ a: 0, b: 0 }), []);
});

// REQ: MI-07 planned budget against actual expenses per category, with over-plan marked
test("MI-07 budgetVsActual", () => {
  const rows = budgetVsActual(
    [{ category: "Boende", amount: 5200, paid: true }, { category: "Mat/Fritid", amount: 3000, paid: false }],
    [{ category: "Mat/Fritid", amount: 3100 }, { category: "Boende", amount: 5000 }, { category: "Parkering", amount: 180 }],
  );
  assert.deepEqual(rows, [
    { category: "Boende", planned: 5200, actual: 5000, over: false },
    { category: "Mat/Fritid", planned: 3000, actual: 3100, over: true },
    { category: "Parkering", planned: 0, actual: 180, over: true },
  ]);
});

// REQ: MI-08 balances are described in words
test("MI-08 balanceText", () => {
  assert.equal(balanceText(66.66), "får tillbaka 66,66 kr");
  assert.equal(balanceText(-1200), "ska betala 1 200 kr");
  assert.equal(balanceText(0.001), "kvitt");
});

// REQ: LC-03 amounts with öre always show two decimals; LC-02 dates in Swedish
test("LC-03 LC-02 kr with öre and shortDate", async () => {
  const { kr, shortDate } = await import("../src/format.ts");
  assert.equal(kr(250.5), "250,50 kr");
  assert.equal(kr(8950.5), "8 950,50 kr");
  assert.equal(kr(12), "12 kr");
  assert.equal(shortDate("2026-07-12"), "12 jul 2026");
});
