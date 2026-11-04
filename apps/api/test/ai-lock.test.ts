import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Trip } from "@trip/schema";
import { runAi, fixedOf, type AiCall, type AiFeature } from "../src/ai.ts";
import { FEATURES } from "../src/ai-features.ts";
import { CASES, currentLock, hashOf, staleOf } from "../src/ai-lock.ts";

const lock = JSON.parse(readFileSync(new URL("../ai-prompts.lock.json", import.meta.url), "utf8")) as Record<string, string>;
const trip = (title: string, date: string) => Trip.parse({ id: "t", revision: 1, title, timezone: "Europe/Berlin", stops: [], packing: [], tasks: [], travelers: [{ id: "a", name: "Erik", packing: [] }], places: [], bookings: [],
  days: [], purpose: `Vi åker ${date}`, expenses: [] });
const feature = (instructions: string): AiFeature => ({ area: "suggestions", instructions, task: "Propose tasks.", allows: () => true });
const reply = { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: "" }],
  usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
/** What a run sends apart from the messages. */
const sent = async (f: AiFeature, t: Trip, today: string) => {
  let req: Parameters<AiCall>[0] | undefined;
  await runAi(async (r) => { req = r; return reply as never; }, f, t, [], today);
  const { messages: _m, ...fixed } = req!;
  return fixed;
};

test("DP-18 the lock holds every feature, and each fixed part matches its lock", () => {
  assert.deepEqual(Object.keys(lock).sort(), Object.keys(CASES).sort());
  const stale = staleOf(lock);
  assert.deepEqual(stale, [], `a prompt or tool changed; run: node apps/api/scripts/ai-lock.mjs\n${stale.join("\n")}`);
});

test("DP-18 an unchanged fixed part passes, and a changed instruction fails naming the feature and the cases", () => {
  assert.deepEqual(staleOf(currentLock(), currentLock()), []);
  const changed = { ...currentLock(), draft: hashOf(fixedOf({ ...FEATURES.draft!, instructions: FEATURES.draft!.instructions + " Be brief." })) };
  const stale = staleOf(currentLock(), changed);
  assert.equal(stale.length, 1);
  assert.match(stale[0]!, /^draft: UAT-01, UAT-02, UAT-03, UAT-17 will call the real AI service once/);
  assert.match(staleOf({ ...currentLock(), "read:receipt": "x" })[0]!, /^read:receipt: no user test replays it/);
});

test("DP-18 trip data and dates do not affect the hash", async () => {
  const f = feature("Propose tasks.");
  const a = await sent(f, trip("Göteborg", "2027-03-05"), "2027-02-01");
  const b = await sent(f, trip("Skåne", "2028-07-10"), "2028-06-01");
  assert.equal(hashOf(a), hashOf(b));
  assert.equal(hashOf(fixedOf(f)), hashOf({ ...a, task: f.task }));
  assert.notEqual(hashOf(a), hashOf(await sent(feature("Propose other tasks."), trip("Göteborg", "2027-03-05"), "2027-02-01")));
});
