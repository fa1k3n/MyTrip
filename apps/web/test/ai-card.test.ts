import { test } from "node:test";
import assert from "node:assert/strict";
import { aiCardKind } from "../src/format.ts";

// REQ: AI-99 the AI card shows the account line without switches, the service line without a service
test("AI-99 which text the AI card shows", () => {
  assert.equal(aiCardKind({ aiService: false, aiAccount: false }), "account");
  assert.equal(aiCardKind({ aiService: false }), "service");
  assert.equal(aiCardKind({ aiService: true }), "full");
});
