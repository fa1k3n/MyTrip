import { test } from "node:test";
import assert from "node:assert/strict";
import { dragOffset, settle } from "../src/upday.ts";

// REQ: UP-55 the day follows the finger; at the first and last day it gives way only a little
test("UP-55 dragOffset follows the finger and resists at the ends", () => {
  assert.equal(dragOffset(-120, true), -120, "there is a day to go to");
  assert.equal(dragOffset(90, true), 90);
  assert.equal(dragOffset(100, false), 25, "no day that way: a quarter of it");
  assert.equal(dragOffset(-400, false), -40, "and never more than 40 px");
  assert.equal(dragOffset(0, false), 0);
});

// REQ: UP-55 on release it goes on when dragged far or fast enough, otherwise it springs back
test("UP-55 settle by distance and by speed", () => {
  assert.equal(settle(-140, 10, 600, 390), 1, "a third of the width: the next day");
  assert.equal(settle(140, 10, 600, 390), -1, "to the right: the previous day");
  assert.equal(settle(-100, 5, 600, 390), 0, "short and slow: back");
  assert.equal(settle(-100, 5, 120, 390), 1, "short but fast: on");
  assert.equal(settle(-40, 0, 40, 390), 0, "under 60 px is not a swipe however fast (UP-52)");
});
test("UP-55 settle ignores a vertical move", () => {
  assert.equal(settle(-150, 140, 300, 390), 0);
  assert.equal(settle(-150, 140, 80, 390), 0);
});
