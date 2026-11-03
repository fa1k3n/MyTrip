import { test } from "node:test";
import assert from "node:assert/strict";
import { aiSuggestions, llmProposals } from "../src/proposals.ts";
import { helperLine, runNowShown, runNowTip } from "../src/format.ts";

const p = (id: string, source?: object, status = "pending") => ({ id, status, source: source as { kind: string } | undefined, ops: [] });

// REQ: AI-70 a helper's suggestions are shown in their list, not among the proposals to review
test("AI-70 suggestions are apart from the review", () => {
  const list = [p("llm"), p("mail", { kind: "mail" }), p("ai", { kind: "ai", feature: "prep" }), p("s1", { kind: "ai", feature: "prep", item: true }),
    p("s2", { kind: "ai", feature: "wishes", item: true }), p("s3", { kind: "ai", feature: "prep", item: true }, "rejected")];
  assert.deepEqual(llmProposals(list).map((x) => x.id), ["llm", "ai"]);
  assert.deepEqual(aiSuggestions(list, "prep").map((x) => x.id), ["s1"]);
});

// REQ: AI-68 AI-72 next to the switch: when the helper last ran, why it did not, and about how many runs are left
test("AI-68 AI-72 helperLine", () => {
  const tz = "Europe/Stockholm";
  assert.equal(helperLine({ remaining: 8 }, tz), "Har inte körts än · ca 8 körningar kvar");
  assert.equal(helperLine({ at: "2026-11-02T13:05:00.000Z", result: "proposal", remaining: 1 }, tz), "Senast 2 nov 14:05 · ca 1 körning kvar");
  assert.equal(helperLine({ at: "2026-11-02T13:05:00.000Z", result: "nothing", remaining: 3 }, tz), "Senast 2 nov 14:05, inget nytt · ca 3 körningar kvar");
  assert.equal(helperLine({ at: "2026-11-02T13:05:00.000Z", result: "error", remaining: 3 }, tz), "Misslyckades 2 nov 14:05 · ca 3 körningar kvar");
  assert.equal(helperLine({ at: "2026-11-02T13:05:00.000Z", result: "cap", remaining: 0 }, tz), "Taket för månaden är nått");
  assert.equal(helperLine({ remaining: 0 }, tz), "Taket för månaden är nått");
});

// REQ: AI-96 Kör nu on the helper's card shows only while AI is on for the instance and the trip and the helper is offered and on
test("AI-96 runNowShown", () => {
  const st = (h: object, enabled = true) => ({ enabled, helpers: { wishes: { available: true, on: true, remaining: 3, ...h } } });
  assert.equal(runNowShown(st({}), true, "wishes"), true);
  assert.equal(runNowShown(st({ on: false }), true, "wishes"), false, "switch off");
  assert.equal(runNowShown(st({ available: false }), true, "wishes"), false, "not offered");
  assert.equal(runNowShown(st({}), false, "wishes"), false, "AI off for the trip");
  assert.equal(runNowShown(st({}, false), true, "wishes"), false, "AI off for the instance");
  assert.equal(runNowShown(null, true, "wishes"), false, "may not start AI: no status");
  assert.equal(runNowShown(st({}), true, "packing"), false);
});

// REQ: AI-96 the runs left are in Kör nu's tooltip
test("AI-96 runNowTip", () => {
  assert.equal(runNowTip("Förslag på önskningar", { remaining: 3 }), "Kör nu: Förslag på önskningar · ca 3 körningar kvar");
  assert.equal(runNowTip("Förslag på önskningar", { remaining: 0 }), "Kör nu: Förslag på önskningar · Taket för månaden är nått");
});
