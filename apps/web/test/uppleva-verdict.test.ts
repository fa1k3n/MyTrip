import { test } from "node:test";
import assert from "node:assert/strict";
import { hasEnded } from "../src/upday.ts";
import { verdictWish } from "../src/memories.ts";

const a = (id: string, start?: string, more: { durationMin?: number; end?: string } = {}) => ({ id, start, estimated: true, ...more });

// REQ: UP-50 an activity has ended at its fixed end, at its start plus its duration, else when the next one starts; never on another day
test("UP-50 hasEnded", () => {
  const day = [a("fika", "10:00", { durationMin: 30 }), a("zoo", "11:00"), a("lunch", "13:00", { end: "14:00" })];
  assert.equal(hasEnded(day, 0, "10:29"), false);
  assert.equal(hasEnded(day, 0, "10:30"), true, "start plus duration");
  assert.equal(hasEnded(day, 1, "12:59"), false);
  assert.equal(hasEnded(day, 1, "13:00"), true, "no duration: when the next one starts");
  assert.equal(hasEnded(day, 2, "14:00"), true, "a fixed end");
  assert.equal(hasEnded([a("kväll", "19:00")], 0, "23:59"), false, "the last without an end never ends on its own");
  assert.equal(hasEnded(day, 0, undefined), false, "not today: no clock");
});

// REQ: UP-50 only an ended activity linked to a visible wish gets verdict buttons
test("UP-50 verdictWish", () => {
  const dreams = [{ id: "w1", title: "Zoo" }, { id: "w2", title: "Hemlig", hidden: true }];
  assert.equal(verdictWish(dreams, { dreamId: "w1" }, true)?.id, "w1");
  assert.equal(verdictWish(dreams, { dreamId: "w1" }, false), undefined, "not ended yet");
  assert.equal(verdictWish(dreams, {}, true), undefined, "no wish");
  assert.equal(verdictWish(dreams, { dreamId: "w2" }, true), undefined, "a hidden wish");
  assert.equal(verdictWish(dreams, { dreamId: "w1", hidden: true }, true), undefined, "a hidden activity");
  assert.equal(verdictWish(dreams, { dreamId: "gone" }, true), undefined, "a wish that no longer exists");
});
