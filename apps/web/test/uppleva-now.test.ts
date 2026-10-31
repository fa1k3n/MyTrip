import { test } from "node:test";
import assert from "node:assert/strict";
import { clashes, nowAt } from "../src/upday.ts";
import { sv } from "../src/sv.ts";
import { svAdmin } from "../src/sv-admin.ts";

type A = { id: string; text: string; start?: string; end?: string; durationMin?: number; estimated: boolean };
const a = (id: string, start: string | undefined, x: Partial<A> = {}): A => ({ id, text: id, start, estimated: false, ...x });

// REQ: UP-28 every overlap with the next timed activity, fixed or estimated
test("UP-28 clashes", () => {
  const list = [a("middag", "18:15", { estimated: true, durationMin: 60 }), a("stad", "19:00", { durationMin: 90 }), a("kv", "21:00", { estimated: true, durationMin: 30 })];
  const c = clashes(list);
  assert.deepEqual([...c.keys()], ["middag"]); // the walk ends 20.30, before 21.00
  assert.equal(c.get("middag")!.end, "19:15");
  assert.equal(c.get("middag")!.with.id, "stad");
  assert.equal(sv.up.clash("19:15", "Stadsvandring", "19:00"), "Slutar 19.15 och krockar med Stadsvandring 19.00"); // no "ca" (UP-36)
  assert.deepEqual([...clashes([a("m", "18:15", { durationMin: 60 }), a("s", "19:00")]).keys()], ["m"]); // fixed against fixed
  assert.deepEqual([...clashes([a("m", "18:15", { estimated: true, durationMin: 60 }), a("s", "19:00", { estimated: true })]).keys()], ["m"]); // estimated against estimated
  assert.deepEqual([...clashes([a("m", "18:15", { end: "19:30" }), a("x", undefined), a("s", "19:00")]).keys()], ["m"]); // an untimed activity in between
  assert.equal(clashes([a("m", "18:15", { durationMin: 45 }), a("s", "19:00")]).size, 0); // ends in time
  assert.equal(clashes([a("m", "18:15")]).size, 0); // unknown length
});

// REQ: UP-29 the "Nu" line goes before the first activity that starts after the clock
test("UP-29 nowAt", () => {
  const list = [a("avf", "06:30"), a("bullar", "09:00"), a("malmo", "15:30", { end: "17:00" }), a("x", undefined), a("middag", "18:15")];
  assert.equal(nowAt(list, "15:52"), 4); // after the activity under way and the untimed one, before the next start
  assert.equal(nowAt(list, "09:00"), 2); // an activity that starts now is already under way
  assert.equal(nowAt(list, "06:00"), 0);
  assert.equal(nowAt(list, "23:00"), 5); // after the last one
  assert.equal(nowAt(list, undefined), -1); // not today
  assert.equal(nowAt([], "12:00"), 0);
});

// REQ: UP-30 the interface says "utlägg", never "utgift"
test("UP-30 one word for an expense", () => {
  assert.equal(sv.addExpense, "Lägg till utlägg");
  assert.equal(sv.newExpense, "Nytt utlägg");
  assert.equal(sv.expenses, "Utlägg");
  const texts = [JSON.stringify(sv), JSON.stringify(svAdmin), sv.notice.expense("Anna", "Glass"), sv.notice.approved("Bo", "Glass"),
    sv.notice.rejected("Bo", "Glass"), sv.choose.unsent(1), sv.choose.unsent(2)];
  for (const x of texts) assert.doesNotMatch(x, /utgift/i);
});
