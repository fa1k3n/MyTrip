import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { runAi, type AiCall, type AiFeature } from "../src/ai.ts";

const trip = () => Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], packing: [], tasks: [], travelers: [], places: [], bookings: [], days: [], expenses: [] });
const bad = { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops: [{ op: "add", path: "tasks/-", value: { id: "x" } }], reason: "r" } }],
  usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
const good = { ...bad, content: [{ type: "tool_use", id: "t2", name: "propose_change", input: { ops: [{ op: "add", path: "tasks/-", value: { id: "k", text: "Köp", done: false } }], reason: "r" } }] };
const fake = (...replies: unknown[]) => {
  const seen: Parameters<AiCall>[0][] = [];
  const f: AiCall = async (req) => { seen.push(structuredClone(req)); return replies[Math.min(seen.length - 1, replies.length - 1)] as never; };
  return Object.assign(f, { seen });
};
const feature = (web: boolean): AiFeature => ({ area: "suggestions", instructions: "Propose tasks.", task: "Propose tasks.", web, allows: (o) => o.op === "add" && o.path === "tasks/-" });

test("AI-97 the fixed part (system and tools) is cached, the messages are not", async () => {
  const ai = fake(bad, good);
  await runAi(ai, feature(true), trip());
  assert.equal(ai.seen.length, 2, "a retry");
  for (const r of ai.seen) {
    assert.ok(Array.isArray(r.system), "system in blocks");
    const blocks = r.system as { cache_control?: unknown }[];
    assert.deepEqual(blocks.at(-1)!.cache_control, { type: "ephemeral" });
    assert.equal(blocks.slice(0, -1).filter((b) => b.cache_control).length, 0);
    assert.ok(!JSON.stringify(r.messages).includes("cache_control"), "the changing part is not marked");
  }
});

test("AI-97 web search is allowed 5 times a run", async () => {
  const ai = fake(good);
  await runAi(ai, feature(true), trip());
  const search = (ai.seen[0]!.tools as { name: string; max_uses?: number }[]).find((x) => x.name === "web_search");
  assert.equal(search?.max_uses, 5);
});
