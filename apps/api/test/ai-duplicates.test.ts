import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import { sameSuggestion, type AiCall } from "../src/ai.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const reply = (ops: unknown[]) => ({
  id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops, reason: "Förslag" } }],
  usage: { input_tokens: 10, output_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } },
});

// REQ: AI-95 the same place under another word order or form, or another branch of the same chain, is the same suggestion
test("AI-95 the same place in other words", () => {
  assert.ok(sameSuggestion("Göteborgs stadsmuseum", "Stadsmuseet i Göteborg"));
  assert.ok(sameSuggestion("Pinchos, Avenyn", "Pinchos (Linnégatan)"));
  assert.ok(sameSuggestion("Hamnrundtur", "hamnrundtur med båt")); // as before (AI-70)
  assert.ok(!sameSuggestion("Göteborgs konstmuseum", "Göteborgs stadsmuseum"));
  assert.ok(!sameSuggestion("Restaurang Kajen", "Restaurang Hamnen"));
  assert.ok(!sameSuggestion("Beställ miljödekal till bilen", "Köp vinjett till bilen"));
});

// REQ: AI-95 the wish helper leaves out a suggestion whose wish or place is the same as one the trip has or another suggestion of the run
test("AI-95 no second museum or branch from the wish helper", async () => {
  const day = (i: number) => ({ id: `d${i}`, date: `2027-12-0${4 + i}`, title: "Göteborg", summary: "S.", icons: ["Mat"], start: "09:00", end: "18:00", location: "Göteborg", legs: [], activities: [] });
  const t = { id: "gbg", revision: 1, title: "Göteborg", timezone: "Europe/Stockholm", stops: [], places: [], bookings: [], tasks: [], purpose: "Äta gott.",
    aiConsent: { by: "Anna", at: "2026-11-01T10:00:00.000Z" }, travelers: [{ id: "anna", name: "Anna", packing: [] }], days: [day(0), day(1)],
    dreams: [{ id: "stadsmuseum", title: "Göteborgs stadsmuseum", category: "Museum", source: "AI-hjälpen", icon: "✨", votes: 0 }] };
  const suggestion = (id: string, title: string, place: string, d: number) => [
    { op: "add", path: "dreams/-", value: { id, title, category: "Mat", url: `https://example.com/${id}` } },
    { op: "add", path: `days/${d}/activities/-`, value: { id: `a-${id}`, text: title, dreamId: id, placeIds: [`p-${id}`], category: "Mat", durationMin: 90 } },
    { op: "add", path: "places/-", value: { id: `p-${id}`, name: place, address: "Exempelgatan 1, Göteborg" } }];
  const ops = [...suggestion("museet", "Stadsmuseet i Göteborg", "Stadsmuseet", 0), ...suggestion("pinchos-1", "Pinchos Avenyn", "Pinchos", 0),
    ...suggestion("pinchos-2", "Pinchos Linnégatan", "Pinchos", 1), ...suggestion("universeum", "Universeum", "Universeum", 1)];
  const store = memoryStore([t]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const app = createApp(store, tokens, { aiService: true, ai: { call: (async () => reply(ops)) as unknown as AiCall } });
  const r = await app.request("/api/trips/gbg/ai/wishes", { method: "POST", headers: { authorization: "Bearer a" } });
  assert.equal(r.status, 202);
  const ps = (await store.proposals("gbg")).filter((p) => p.status === "pending");
  assert.deepEqual(ps.map((p) => (p.ops[0]!.value as { title: string }).title), ["Pinchos Avenyn", "Universeum"]);
});
