import { test } from "node:test";
import assert from "node:assert/strict";
import { focusActivity } from "../src/upday.ts";

type A = { id: string; start?: string; end?: string; durationMin?: number; estimated: boolean };
const a = (id: string, start: string | undefined, x: Partial<A> = {}): A => ({ id, start, estimated: false, ...x });
const list = [a("frukost", "08:00", { end: "09:00" }), a("museum", "10:00", { end: "12:00" }), a("x", undefined), a("middag", "18:00")];

// REQ: UP-56 the current activity, else the next, else nothing (the top of the day)
test("UP-56 focusActivity before the day", () => assert.equal(focusActivity(list, "06:30"), "frukost"));
test("UP-56 focusActivity during an activity", () => assert.equal(focusActivity(list, "10:30"), "museum"));
test("UP-56 focusActivity between activities picks the next", () => assert.equal(focusActivity(list, "09:30"), "museum"));
test("UP-56 focusActivity skips an untimed activity", () => assert.equal(focusActivity(list, "13:00"), "middag"));
test("UP-56 focusActivity after the last one has ended", () => assert.equal(focusActivity([a("a", "08:00", { end: "09:00" })], "20:00"), undefined));
test("UP-56 focusActivity on another day or without activities", () => {
  assert.equal(focusActivity(list, undefined), undefined);
  assert.equal(focusActivity([], "10:00"), undefined);
});
