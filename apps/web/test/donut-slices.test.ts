import { test } from "node:test";
import assert from "node:assert/strict";
import { donutSlices } from "../src/budget.ts";

const t = (extra: object = {}) => ({
  currency: "SEK",
  budget: [{ category: "Boende", amount: 5000 }, { category: "Transport", amount: 2000 }, { category: "Boende", amount: 200 }, { category: "Övrigt", amount: 50, currency: "EUR" }],
  expenses: [{ amount: 300 }, { amount: 500.5 }],
  ...extra,
});

// REQ: BG-14 with a maximum the donut shows the categories, the expenses and the unused part; the centre shows used and the maximum
test("BG-14 donutSlices with a maximum", () => {
  assert.deepEqual(donutSlices(t({ budgetMax: 10000 })), {
    slices: [{ label: "Boende", value: 5200, kind: "cat" }, { label: "Transport", value: 2000, kind: "cat" },
      { label: "Utlägg under resan", value: 800.5, kind: "spent" }, { label: "Oanvänt", value: 1999.5, kind: "unused" }],
    total: 10000, used: 8000.5, max: 10000,
  });
  const over = donutSlices(t({ budgetMax: 7500 }));
  assert.deepEqual([over.slices.map((s) => s.kind), over.total, over.used], [["cat", "cat", "spent"], 8000.5, 8000.5]);
});

// REQ: BG-09 without a maximum the donut is the planned budget per category, as before
test("BG-09 donutSlices without a maximum", () => {
  assert.deepEqual(donutSlices(t()), {
    slices: [{ label: "Boende", value: 5200, kind: "cat" }, { label: "Transport", value: 2000, kind: "cat" }], total: 7200, used: 7200, max: undefined,
  });
});
