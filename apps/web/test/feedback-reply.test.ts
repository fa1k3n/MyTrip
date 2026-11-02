import { test } from "node:test";
import assert from "node:assert/strict";
import { newReply } from "../src/format.ts";

// REQ: US-34 the "Tyck till" button has a dot when an answer has come since the dialog was last opened
test("US-34 a dot for an answer newer than the last opening", () => {
  const notes = [{ replyAt: "2026-11-02T10:00:00.000Z" }, {}];
  assert.equal(newReply(notes, null), true);
  assert.equal(newReply(notes, "2026-11-02T09:00:00.000Z"), true);
  assert.equal(newReply(notes, "2026-11-02T10:00:00.000Z"), false);
  assert.equal(newReply([{}], null), false);
});
