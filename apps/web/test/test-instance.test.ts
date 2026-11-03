import { test } from "node:test";
import assert from "node:assert/strict";
import { isTestInstance } from "../src/access.ts";
import { sv } from "../src/sv.ts";

// REQ: DP-12 the test instance shows a banner on every page, told by its address, so the same build runs on both
test("DP-12 the test instance is told by its address", () => {
  assert.equal(isTestInstance("staging.baslager.app"), true);
  assert.equal(isTestInstance("mytrip-staging.example.workers.dev"), true);
  assert.equal(isTestInstance("baslager.app"), false);
  assert.equal(isTestInstance("mytrip.example.workers.dev"), false);
  assert.equal(isTestInstance("localhost"), false);
  assert.equal(sv.testInstance, "Testinstans");
});
