import { test } from "node:test";
import assert from "node:assert/strict";
import { donutTotalSize } from "../src/format.ts";

// REQ: BG-11 the total fits inside the ring: estimated text width stays within the hole, smaller for longer amounts
test("BG-11 donutTotalSize fits the total inside the ring", () => {
  for (const s of ["600 kr", "13 000 kr", "123 456 kr", "1 234 567 kr"]) {
    assert.ok(donutTotalSize(s) * 0.6 * s.length <= 48, s);
  }
  assert.ok(donutTotalSize("13 000 kr") < 11);
  assert.ok(donutTotalSize("1 234 567 kr") < donutTotalSize("13 000 kr"));
  assert.ok(donutTotalSize("600 kr") <= 10);
});
