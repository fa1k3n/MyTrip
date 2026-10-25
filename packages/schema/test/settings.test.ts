import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_AREAS, Settings, aiOn } from "../src/settings.ts";

// REQ: AI-06 AI is off until a user turns it on
test("AI-06 settings default to AI off", () => {
  const s = Settings.parse({});
  assert.equal(s.ai.enabled, false);
  assert.equal(aiOn(s, "changes", true), false);
});

// REQ: AI-07 a feature runs only with a service, the main switch on and its area on
test("AI-07 aiOn needs service, main switch and area", () => {
  const on = Settings.parse({ ai: { enabled: true } });
  for (const area of AI_AREAS) assert.equal(aiOn(on, area, true), true, area); // areas default to on
  assert.equal(aiOn(on, "changes", false), false);
  const noInbox = Settings.parse({ ai: { enabled: true, areas: { mail: false } } });
  assert.equal(aiOn(noInbox, "mail", true), false);
  assert.equal(aiOn(noInbox, "images", true), true);
  const off = Settings.parse({ ai: { enabled: false, areas: { changes: true } } });
  assert.equal(aiOn(off, "changes", true), false);
});

// REQ: AI-07 the areas are capabilities: what the AI may do with the user's data
test("AI-07 areas", () => {
  assert.deepEqual([...AI_AREAS], ["images", "texts", "suggestions", "changes", "mail", "receipts", "web", "location"]);
});

// REQ: AI-09 invalid settings are rejected
test("AI-09 Settings rejects unknown areas and wrong types", () => {
  assert.throws(() => Settings.parse({ ai: { enabled: true, areas: { kitchen: true } } }));
  assert.throws(() => Settings.parse({ ai: { enabled: "yes" } }));
});
