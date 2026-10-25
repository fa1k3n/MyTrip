import { test } from "node:test";
import assert from "node:assert/strict";
import { todayId } from "../src/format.ts";

// REQ: DC-15 the day of today is found by its date, so its card and timeline stop can be marked
test("DC-15 todayId", () => {
  const days = [{ id: "a", date: "2026-10-25" }, { id: "b", date: "2026-10-26" }];
  assert.equal(todayId(days, "2026-10-26"), "b");
  assert.equal(todayId(days, "2026-10-27"), undefined);
});
