import { test } from "node:test";
import assert from "node:assert/strict";
import { byDay } from "../src/budget.ts";

const act = (id: string, dreamId?: string, hidden?: boolean) => ({ id, text: id, ...(dreamId ? { dreamId } : {}), ...(hidden ? { hidden } : {}) });
const days = [
  { id: "d2", date: "2026-10-26", activities: [act("zoo", "w-zoo"), act("lunch")] },
  { id: "d1", date: "2026-10-25", activities: [act("museum", "w-museum")] },
];
const dreams = [{ id: "w-museum", title: "Museum" }, { id: "w-zoo", title: "Zoo" }, { id: "w-glass", title: "Glass" }];
const ex = (amount: number, o: { activityId?: string; dreamId?: string; date?: string } = {}) => ({ amount, ...o });

// REQ: BG-22 expenses per day and wish: the wish chosen, else the activity's wish; "Utan önskan" and "Utan datum"
test("BG-22 byDay", () => {
  const r = byDay({ days, dreams, expenses: [
    ex(100, { activityId: "zoo" }), ex(40.5, { dreamId: "w-glass", date: "2026-10-26" }), ex(60, { activityId: "lunch" }),
    ex(30, { date: "2026-10-26" }), ex(10, { activityId: "museum" }), ex(5, { dreamId: "w-zoo", activityId: "zoo" }), ex(7),
  ] });
  assert.deepEqual(r, [
    { date: "2026-10-25", sum: 10, rows: [{ title: "Museum", dreamId: "w-museum", sum: 10 }] },
    { date: "2026-10-26", sum: 235.5, rows: [{ title: "Zoo", dreamId: "w-zoo", sum: 105 }, { title: "Glass", dreamId: "w-glass", sum: 40.5 }, { title: "Utan önskan", sum: 90 }] },
    { sum: 7, rows: [{ title: "Utan datum", sum: 7 }] },
  ]);
  assert.deepEqual(byDay({ days, dreams, expenses: [] }), []);
});
