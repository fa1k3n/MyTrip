import { test } from "node:test";
import assert from "node:assert/strict";
import { withReplay, type ReplayKv } from "../src/ai-replay.ts";
import { costOf, type AiCall } from "../src/ai.ts";

const kv = (): ReplayKv & { size: () => number } => { const m = new Map<string, string>(); return { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, size: () => m.size }; };
const answer = (text: string) => ({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_sequence: null,
  content: [{ type: "text", text }], usage: { input_tokens: 10_000, output_tokens: 2_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 3 } } });
const ask = (today: string, trip: string) => ({ model: "claude-opus-5-5", max_tokens: 100, system: "Plan.", messages: [{ role: "user" as const, content: `<today>${today}</today>\n<trip>${trip}</trip>` }] });

// REQ: DP-13 the same request again gets the recorded answer at no cost; another request calls the AI service
test("DP-13 record and replay", async () => {
  let calls = 0;
  const service = (async () => { calls++; return answer("Dag 1 är 2026-11-24."); }) as unknown as AiCall;
  const store = kv(), call = withReplay(service, "1", store);
  const first = await call(ask("2026-11-03", "start 2026-11-24") as never);
  const again = await call(ask("2026-11-03", "start 2026-11-24") as never);
  assert.equal(calls, 1);
  assert.ok(costOf(first).usd > 0);
  assert.equal(costOf(again).usd, 0, "a replayed answer costs nothing");
  assert.deepEqual(again.content, first.content);
  await call(ask("2026-11-03", "start 2026-11-25") as never);
  assert.equal(calls, 2, "changed trip data asks the service");
  assert.equal(store.size(), 2);
});

// REQ: DP-13 dates count from <today>: a test run on a later day with the same relative dates replays, its dates moved as many days
test("DP-13 replay on another day", async () => {
  let calls = 0;
  const service = (async () => { calls++; return answer("Dag 1 är 2026-11-24."); }) as unknown as AiCall;
  const call = withReplay(service, "1", kv());
  await call(ask("2026-11-03", "start 2026-11-24") as never);
  const later = await call(ask("2026-11-10", "start 2026-12-01") as never);
  assert.equal(calls, 1);
  assert.deepEqual(later.content, [{ type: "text", text: "Dag 1 är 2026-12-01." }]);
});

// REQ: DP-13 without AI_REPLAY (live) every call goes to the service
test("DP-13 off unless asked for", async () => {
  let calls = 0;
  const service = (async () => { calls++; return answer("x"); }) as unknown as AiCall;
  for (const flag of [undefined, "", "0"]) {
    const call = withReplay(service, flag, kv());
    await call(ask("2026-11-03", "a") as never); await call(ask("2026-11-03", "a") as never);
  }
  assert.equal(calls, 6);
});
