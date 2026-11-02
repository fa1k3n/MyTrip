import { test } from "node:test";
import assert from "node:assert/strict";
import { swipeStep } from "../src/upday.ts";

// REQ: UP-52 a clearly sideways swipe of at least 60 px changes the day: left for the next, right for the previous
test("UP-52 swipeStep", () => {
  assert.equal(swipeStep(-80, 10), 1, "to the left: the next day");
  assert.equal(swipeStep(80, -10), -1, "to the right: the previous day");
  assert.equal(swipeStep(-59, 0), 0, "too short");
  assert.equal(swipeStep(-80, 70), 0, "mostly a scroll");
  assert.equal(swipeStep(0, 0), 0);
});
