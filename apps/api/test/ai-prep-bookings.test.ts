import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES } from "../src/ai-features.ts";

// REQ: BK-21 the helper is told to make one booking per stay of consecutive nights and per direction of a trip, with their own dates
test("BK-21 one booking per stay and per direction", () => {
  const task = FEATURES.prep!.task;
  assert.ok(task.includes("one booking per stay"), "a stay");
  assert.ok(task.includes("one booking per direction"), "a ferry out and back");
});
