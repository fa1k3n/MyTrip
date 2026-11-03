import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import type { AiCall } from "../src/ai.ts";
import { FEATURES } from "../src/ai-features.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const day = (id: string, date: string) => ({ id, date, title: "Dag", summary: "S.", icons: ["Natur"], start: "08:00", end: "18:00", activities: [] });
const base = (id: string, extra: object = {}) => ({
  id, revision: 1, title: id, timezone: "Europe/Berlin", stops: [], packing: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", age: 41, packing: [] }, { id: "olle", name: "Olle", age: 9, packing: [] }], ...extra,
});
const wish = (id: string, title: string, category: string) => ({ id, title, category, source: "Från planen", icon: "✨", votes: 0 });
/** Olle's earlier Berlin trip with verdicts and comments, Kim's trip, and Olle's new trip to Hamburg. */
const trips = [
  base("berlin", { days: [day("b1", "2026-10-24")], dreams: [wish("tv", "Fernsehturm", "Utsikt"), wish("zoo", "Zoo Berlin", "Natur"), wish("mall", "Mall of Berlin", "Shopping")],
    memories: [
      { id: "m1", dreamId: "tv", by: "anna", verdict: "again", note: "Boka i förväg, Anna tyckte kön var lång. Ring 040-123 45 67." },
      { id: "m2", dreamId: "tv", by: "olle", verdict: "again" },
      { id: "m3", dreamId: "mall", by: "anna", verdict: "never", note: "För trångt" },
      { id: "m4", dreamId: "zoo", by: "olle", verdict: "ok" }] }),
  base("kims", { days: [day("k1", "2026-09-01")], dreams: [wish("x", "Kims hemliga ställe", "Mat")], memories: [{ id: "k", dreamId: "x", by: "anna", verdict: "again" }] }),
  base("hamburg", { purpose: "Höstlov i Hamburg.", days: [day("h1", "2027-10-23")], aiConsent: { by: "Anna", at: "2027-01-01T10:00:00.000Z" }, aiHelpers: { wishes: true } }),
];
const reply = {
  id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops: [], reason: "Inget nytt" } }],
  usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } },
};

// REQ: AI-14 the wish helper gets the owner's earlier memories: counts and scrubbed comments, never who, never other owners' trips
test("AI-14 the wish helper is given the memories of the owner's earlier trips", async () => {
  const store = memoryStore(trips);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  for (const [t, o] of [["berlin", "olle"], ["kims", "kim"], ["hamburg", "olle"]]) await store.saveOwner(t!, o!);
  const seen: Parameters<AiCall>[0][] = [];
  const app = createApp(store, tokens, { aiService: true, ai: { call: async (req) => { seen.push(structuredClone(req)); return reply as never; } } });
  const r = await app.request("/api/trips/hamburg/ai/wishes", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer a" }, body: "{}" });
  assert.ok(r.ok, await r.clone().text());
  const sent = JSON.stringify(seen[0]!.messages);
  assert.ok(sent.includes("<memories>"));
  const block = /<memories>\\n(.*?)\\n<\/memories>/.exec(sent)![1]!.replace(/\\"/g, '"');
  const mem = JSON.parse(block) as { title: string; category: string; again: number; ok: number; never: number; comments?: string[] }[];
  assert.deepEqual(mem.map((m) => [m.title, m.again, m.ok, m.never]), [["Fernsehturm", 2, 0, 0], ["Zoo Berlin", 0, 1, 0], ["Mall of Berlin", 0, 0, 1]]);
  assert.equal(mem[0]!.category, "Utsikt");
  assert.ok(!sent.includes("Kims hemliga"), "another owner's trip");
  assert.ok(!sent.includes("Anna tyckte") && !sent.includes("040-123"), "names and numbers removed");
  assert.ok(mem[0]!.comments![0]!.startsWith("Boka i förväg"));
  assert.ok(!sent.includes('"by"'), "never who");
  // AI-91: which trips' memories were used, to show the people
  const body = await r.json();
  assert.deepEqual(body.memoriesFrom, ["berlin"]);

});

// REQ: AI-14 the instructions say how to use the memories; only the wish helper gets them
test("AI-14 the wish helper's instructions use the memories", () => {
  assert.ok(FEATURES.wishes!.instructions.includes("<memories>"));
  assert.ok(FEATURES.wishes!.memories);
  assert.ok(!FEATURES.prep!.memories);
});

// REQ: AI-90 the draft adds the named travelers and as many more as it counts
test("AI-90 the draft's instructions count travelers without names", () => {
  const text = FEATURES.draft!.instructions;
  assert.ok(text.includes("Barn 1") && text.includes("as many"));
});
