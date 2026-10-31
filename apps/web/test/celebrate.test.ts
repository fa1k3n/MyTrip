import { test } from "node:test";
import assert from "node:assert/strict";
import { burstLabel, coinOffsets, wantsBurst } from "../src/celebrate.ts";

// REQ: UP-35 the amount as entered rises from the button
test("UP-35 burstLabel", () => {
  assert.equal(burstLabel({ amount: 312.87, foreign: { amount: 28.5, currency: "EUR" } }, "SEK"), "+28,50 €");
  assert.equal(burstLabel({ amount: 60 }, "SEK"), "+60 kr");
  assert.equal(burstLabel({ amount: 100, foreign: { amount: 100, currency: "DKK" } }, "SEK"), "+100 DKK");
});

// REQ: UP-35 the coins burst upwards, spread evenly to both sides
test("UP-35 coinOffsets", () => {
  const c = coinOffsets(6, 60);
  assert.equal(c.length, 6);
  for (const x of c) {
    assert.ok(x.dy < 0, "upwards");
    assert.ok(Math.abs(Math.hypot(x.dx, x.dy) - 60) < 0.5, "at the radius");
  }
  assert.ok(Math.abs(c.reduce((a, x) => a + x.dx, 0)) < 0.5, "as much to the left as to the right");
  assert.deepEqual(coinOffsets(6, 60), c); // the same every time
  assert.deepEqual(coinOffsets(0, 60), []);
});

// REQ: UP-35 AC-06 no burst with reduced motion or without an element to start from
test("UP-35 AC-06 wantsBurst", () => {
  assert.equal(wantsBurst(true, true), false);
  assert.equal(wantsBurst(false, false), false);
  assert.equal(wantsBurst(false, true), true);
});
