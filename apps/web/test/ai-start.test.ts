import { test } from "node:test";
import assert from "node:assert/strict";
import { aiConsentLine, aiErrorText, aiCostLine, capValue } from "../src/format.ts";
import { sv } from "../src/sv.ts";

// REQ: AI-03 a reached cap says whose cap it is; other failures get their own message
test("AI-03 aiErrorText per reason", () => {
  assert.equal(aiErrorText({ error: "cap", scope: "instance" }), sv.aiRun.errors.capInstance);
  assert.equal(aiErrorText({ error: "cap", scope: "account" }), sv.aiRun.errors.capAccount);
  assert.equal(aiErrorText({ error: "off" }), sv.aiRun.errors.off);
  assert.equal(aiErrorText({ error: "something new" }), sv.aiRun.errors.failed);
});

// REQ: AI-03 a cap field accepts a non-negative amount with comma or point, and empty means the default
test("AI-03 capValue", () => {
  assert.equal(capValue("2,5"), 2.5);
  assert.equal(capValue(" 10 "), 10);
  assert.equal(capValue(""), undefined);
  assert.equal(capValue("-1"), null);
  assert.equal(capValue("tio"), null);
});

// REQ: AI-03 the usage overview shows calls and cost per person
test("AI-03 aiCostLine", () => {
  assert.equal(aiCostLine({ name: "Anna", calls: 2, usd: 0.1634 }), "Anna: 2 AI-anrop, 0,16 USD");
});

// REQ: AI-64 the trip's settings show who agreed and when
test("AI-64 aiConsentLine", () => {
  assert.equal(aiConsentLine({ by: "Anna", at: "2026-11-02T08:00:00.000Z" }), `Anna godkände att resan skickas till AI-tjänsten ${"2 nov 2026"}.`);
  assert.match(aiConsentLine({ by: "user", at: "2026-11-02T08:00:00.000Z" }), /^Administratören godkände/);
});
