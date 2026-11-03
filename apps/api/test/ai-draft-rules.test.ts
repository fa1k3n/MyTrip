import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import type { AiCall } from "../src/ai.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: "Bearer a" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const reply = (ops: unknown[]) => ({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops, reason: "Förslag" } }],
  usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } } });
const day = { id: "d0", date: "2027-10-25", title: "Hamburg", summary: "S.", icons: ["car"], start: "09:00", end: "18:00", location: "Hamburg", legs: [], activities: [] };

async function draftWith(rules: unknown) {
  const store = memoryStore([]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const seen: string[] = [];
  const ai: AiCall = async (req) => { seen.push(JSON.stringify(req.system));
    return reply([{ op: "set", path: "title", value: "Hamburg" }, { op: "add", path: "days/-", value: day }, ...(rules ? [{ op: "set", path: "rules", value: rules }] : [])]) as never; };
  const app = createApp(store, tokens, { aiService: true, ai: { call: ai } });
  const t = await json(call(app, "/api/trips", "POST", { title: "Ny resa", purpose: "Hamburg. Vi vill bara resa 3 h om dagen och ha god marginal mellan transporter." }));
  await call(app, `/api/trips/${t.id}/ai/consent`, "POST");
  await call(app, `/api/trips/${t.id}/ai/draft`, "POST");
  return { trip: await json(call(app, `/api/trips/${t.id}`)), seen };
}

// REQ: AI-93 the draft sets the planning rules the description gives (DM-15), marked as AI; only the rules' own fields, in sensible ranges
test("AI-93 the draft sets the planning rules", async () => {
  const { trip, seen } = await draftWith({ maxTravelDayMin: 180, bufferMin: 30, extra: "x" });
  assert.deepEqual(trip.rules, { maxTravelDayMin: 180, bufferMin: 30, ai: true });
  assert.ok(seen[0]!.includes("maxTravelDayMin"), "the instructions say how");
  assert.equal((await draftWith(undefined)).trip.rules, undefined, "no limits in the description: no rules");
  assert.deepEqual((await draftWith({ maxTravelDayMin: 0, maxDriveStretchMin: 5000, bufferMin: 30 })).trip.rules, { bufferMin: 30, ai: true }, "values out of range are left out");
});
