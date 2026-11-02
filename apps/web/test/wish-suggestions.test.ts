import { test } from "node:test";
import assert from "node:assert/strict";
import { wishSuggestion, wishSuggestions } from "../src/aiWishes.ts";

const p = (id: string, day: string | undefined, feature = "wishes", status = "pending") => ({
  id, status, source: { kind: "ai", feature, item: true, ...(day ? { day } : {}) },
  ops: [{ op: "add", path: "dreams/-", value: { id: `w-${id}`, title: "Tierpark Hagenbeck", category: "Aktivitet", url: "https://example.com/", source: "AI", icon: "✨", votes: 0, ai: true } },
    { op: "add", path: "days/1/activities/-", value: { id: `a-${id}`, text: "Djurparken", dreamId: `w-${id}`, category: "Aktivitet", durationMin: 180, start: "10:00", estimated: true } }],
});

// REQ: AI-71 the pending wish suggestions, each read as the wish it adds
// REQ: AI-77 with the activity it adds and the day it is for
test("AI-71 AI-77 wishSuggestion", () => {
  const s = wishSuggestion(p("1", "d1") as never)!;
  assert.equal(s.id, "1");
  assert.deepEqual(s.wish, { id: "w-1", title: "Tierpark Hagenbeck", category: "Aktivitet", url: "https://example.com/", source: "AI", icon: "✨", votes: 0, ai: true });
  assert.equal(s.activity?.text, "Djurparken");
  assert.equal(s.activity?.durationMin, 180);
  assert.equal(s.day, "d1");
  const list = [p("1", "d1"), p("2", "d2", "prep"), p("3", "d2", "wishes", "rejected"), p("4", undefined)] as never[];
  assert.deepEqual(wishSuggestions(list).map((x) => x.id), ["1", "4"]);
  assert.deepEqual(wishSuggestions(list, "d1").map((x) => x.id), ["1"], "only the day's own in a day card");
});
