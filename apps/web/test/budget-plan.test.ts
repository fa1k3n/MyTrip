import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetPlan, planSlices } from "../src/budget.ts";

const ex = (category: string, amount: number) => ({ category, amount });
const t = (extra: object = {}) => ({
  currency: "SEK",
  budget: [
    { category: "Boende", amount: 5000, paid: true }, // paid in advance: plan and utfall
    { category: "Mat", amount: 2000, paid: false },
    { category: "Mat", amount: 300, amountMax: 400, paid: false, estimate: true }, // a range: the upper end is planned
    { category: "Transport", amount: 900, paid: true, estimate: true }, // an estimate is not utfall even when marked paid
    { category: "Övrigt", paid: false }, // not checked: counts as 0
    { category: "Övrigt", amount: 50, currency: "EUR", paid: true }, // another currency: listed, not counted
  ],
  expenses: [ex("Mat", 640.5), ex("Boende", 200), ex("Glass", 45)],
  ...extra,
});

// REQ: BG-15 plan, utfall (paid in advance plus expenses) and prognos per category and in total, in the trip's currency
test("BG-15 budgetPlan counts plan, utfall and prognos", () => {
  const p = budgetPlan(t());
  const row = (c: string) => p.rows.find((r) => r.category === c)!;
  assert.deepEqual(row("Boende"), { category: "Boende", planned: 5000, actual: 5200, forecast: 5200, spent: 200, over: true });
  assert.deepEqual(row("Mat"), { category: "Mat", planned: 2400, actual: 640.5, forecast: 2400, spent: 640.5, over: false });
  assert.deepEqual(row("Transport"), { category: "Transport", planned: 900, actual: 0, forecast: 900, spent: 0, over: false });
  assert.deepEqual(row("Övrigt"), { category: "Övrigt", planned: 0, actual: 0, forecast: 0, spent: 0, over: false });
  assert.deepEqual(row("Glass"), { category: "Glass", planned: 0, actual: 45, forecast: 45, spent: 45, over: true });
  assert.deepEqual([p.planned, p.actual, p.forecast], [8300, 5885.5, 8545]);
  assert.equal(p.max, undefined);
  assert.equal(p.level, "ok");
});

// REQ: BG-15 öre are summed exactly
test("BG-15 budgetPlan sums in öre", () => {
  const p = budgetPlan({ currency: "SEK", budget: [], expenses: [ex("Mat", 0.1), ex("Mat", 0.2)] });
  assert.equal(p.actual, 0.3);
});

// REQ: BG-16 the six categories of MI-30 always, in that order, then the trip's own; Uppleva and Minnas only show own ones with an amount
test("BG-16 category order and the six always", () => {
  const six = ["Boende", "Transport", "Mat", "Upplevelse", "Shopping", "Övrigt"];
  assert.deepEqual(budgetPlan(t()).rows.map((r) => r.category), [...six, "Glass"]);
  assert.deepEqual(budgetPlan(t(), true).rows.map((r) => r.category), [...six, "Glass"]);
  assert.deepEqual(budgetPlan({ currency: "SEK", budget: [], expenses: [] }, true).rows.map((r) => r.category), six, "also an empty budget");
  const own = { currency: "SEK", budget: [{ category: "Nöje", amount: 0, paid: false }, { category: "Upplevelse", amount: 5, paid: false }], expenses: [ex("Fika", 1)] };
  assert.deepEqual(budgetPlan(own).rows.map((r) => r.category), [...six, "Nöje", "Fika"], "Nåla: an own category with an item");
  assert.deepEqual(budgetPlan(own, true).rows.map((r) => r.category), [...six, "Fika"], "Uppleva and Minnas: not an own category at zero");
});

// REQ: BG-19 the total prognos against the maximum: near from 80 %, over above 100 %
test("BG-19 budgetPlan against the maximum", () => {
  const p = (budgetMax: number) => budgetPlan(t({ budgetMax }));
  assert.deepEqual([p(20000).max, p(20000).left, p(20000).percent, p(20000).level], [20000, 11455, 43, "ok"]);
  assert.equal(p(10681.25).level, "near"); // exactly 80 %
  assert.equal(p(8545).level, "near"); // at the maximum, not over it
  assert.deepEqual([p(8000).left, p(8000).percent, p(8000).level], [-545, 107, "over"]);
});

// REQ: BG-18 the donut shows the prognos per category and, with a maximum, the unused part; the centre the prognos
test("BG-18 planSlices", () => {
  assert.deepEqual(planSlices(budgetPlan(t())), {
    slices: [{ label: "Boende", value: 5200, kind: "cat" }, { label: "Transport", value: 900, kind: "cat" }, { label: "Mat", value: 2400, kind: "cat" },
      { label: "Glass", value: 45, kind: "cat" }],
    total: 8545, sum: 8545, max: undefined,
  });
  const withMax = planSlices(budgetPlan(t({ budgetMax: 10000 })));
  assert.deepEqual(withMax.slices.at(-1), { label: "Oanvänt", value: 1455, kind: "unused" });
  assert.deepEqual([withMax.total, withMax.sum, withMax.max], [10000, 8545, 10000]);
  const over = planSlices(budgetPlan(t({ budgetMax: 8000 })));
  assert.deepEqual([over.slices.some((s) => s.kind === "unused"), over.total, over.sum], [false, 8545, 8545]);
});
