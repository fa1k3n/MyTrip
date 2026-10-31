import { test } from "node:test";
import assert from "node:assert/strict";
import { statusBadge } from "../src/format.ts";

// REQ: BK-19 paid and ready are green, cancelled is plain
test("BK-19 statusBadge", () => {
  assert.equal(statusBadge("paid"), "badge ok");
  assert.equal(statusBadge("ready"), "badge ok");
  assert.equal(statusBadge("cancelled"), "badge");
});
