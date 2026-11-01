import { test } from "node:test";
import assert from "node:assert/strict";
import { byActivity } from "../src/budget.ts";

const act = (id: string, text: string, hidden?: boolean) => ({ id, text, ...(hidden ? { hidden } : {}) });
const days = [
  { id: "d2", date: "2026-10-26", activities: [act("zoo", "Zoo"), act("lunch", "Lunch")] },
  { id: "d1", date: "2026-10-25", activities: [act("museum", "Museum"), act("secret", "", true)] },
];
const ex = (amount: number, activityId?: string, date?: string) => ({ amount, ...(activityId ? { activityId } : {}), ...(date ? { date } : {}) });

// REQ: BG-21 expenses per day and activity, in date and day order, with "Utan aktivitet" and "Utan datum"
test("BG-21 byActivity", () => {
  const r = byActivity({ days, expenses: [ex(100, "lunch"), ex(40.5, "zoo"), ex(60, "lunch"), ex(30, undefined, "2026-10-26"), ex(10, "secret"),
    ex(20, "gone", "2026-10-25"), ex(5, undefined, "2026-10-27"), ex(7)] });
  assert.deepEqual(r, [
    { date: "2026-10-25", dayId: "d1", sum: 30, rows: [{ title: "", hidden: true, activityId: "secret", sum: 10 }, { title: "Utan aktivitet", sum: 20 }] },
    { date: "2026-10-26", dayId: "d2", sum: 230.5, rows: [{ title: "Zoo", activityId: "zoo", sum: 40.5 }, { title: "Lunch", activityId: "lunch", sum: 160 }, { title: "Utan aktivitet", sum: 30 }] },
    { date: "2026-10-27", sum: 5, rows: [{ title: "Utan aktivitet", sum: 5 }] },
    { sum: 7, rows: [{ title: "Utan datum", sum: 7 }] },
  ]);
  assert.deepEqual(byActivity({ days, expenses: [] }), []);
});
