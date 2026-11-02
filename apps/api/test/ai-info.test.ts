import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import type { AiCall } from "../src/ai.ts";
import { FEATURES } from "../src/ai-features.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: "Bearer a" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const reply = (ops: unknown[]) => ({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops, reason: "Förslag" } }],
  usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } } });
const day = { id: "d0", date: "2027-10-25", title: "Bilen till Hamburg", summary: "S.", icons: ["car"], start: "09:00", end: "18:00", location: "Hamburg",
  legs: [{ vehicle: "car", origin: "Malmö", destination: "Hamburg" }], activities: [] };
const draft = [{ op: "set", path: "title", value: "Höstlov i Hamburg" }, { op: "add", path: "days/-", value: day }];
const prep = [
  { op: "add", path: "tasks/-", value: { id: "dekal", text: "Beställ miljödekal", done: false, url: "https://example.com/d" } },
  { op: "add", path: "info/-", value: { id: "p-hafen", title: "Parkhaus am Hafen", text: "Max höjd 2,0 m, 25 € per dygn, öppet dygnet runt." } },
  { op: "add", path: "info/-", value: { id: "hvv", title: "Bussbiljett i Hamburg", text: "Köp i appen hvv switch eller i automaten; inte kontant ombord." } },
];

// REQ: AI-87 the helper "Bra att veta" may add info cards, marked as AI with the note to verify them, counted in the notice
test("AI-87 info cards from Bra att veta", async () => {
  const store = memoryStore([]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const ai: AiCall = async (req) => reply(JSON.stringify(req.system).includes("first draft") ? draft : prep) as never;
  const app = createApp(store, tokens, { aiService: true, ai: { call: ai } });
  const { id } = await json(call(app, "/api/trips", "POST", { title: "Ny resa", purpose: "Hamburg med bil." }));
  await call(app, `/api/trips/${id}/ai/consent`, "POST");
  await call(app, `/api/trips/${id}/ai/draft`, "POST");
  const r = await json(call(app, `/api/trips/${id}/ai/prep`, "POST", { apply: true }));
  assert.deepEqual(r.applied, { activities: 0, tasks: 1, bookings: 0, wishes: 0, info: 2 });
  const t = await json(call(app, `/api/trips/${id}`));
  assert.deepEqual(t.info.map((x: { title: string; ai?: boolean; verify?: boolean }) => [x.title, x.ai, x.verify]),
    [["Parkhaus am Hafen", true, true], ["Bussbiljett i Hamburg", true, true]]);
  assert.ok(FEATURES.prep!.helper!.known(t).includes("Parkhaus am Hafen"), "what the trip has is not suggested again");
});

// REQ: AI-87 the helper is asked for parking and ticket cards, and allows only adding them
test("AI-87 the helper's instructions", () => {
  const f = FEATURES.prep!;
  assert.match(f.instructions, /park/i);
  assert.match(f.task, /info\/-/);
  assert.equal(f.allows({ op: "add", path: "info/-", value: {} }), true);
  assert.equal(f.allows({ op: "remove", path: "info/0" }), false);
});

// REQ: PI-06 the AI draft gives each day its country code, so that the emergency numbers can be shown; anything else is dropped
test("PI-06 the draft's country", () => {
  const f = FEATURES.draft!, tidy = (country: unknown) => (f.tidy!({ op: "add", path: "days/-", value: { ...day, country } }).value as { country?: string }).country;
  assert.match(f.task, /country/);
  assert.equal(tidy("DE"), "DE");
  assert.equal(tidy("Tyskland"), undefined);
  assert.equal(tidy(undefined), undefined);
});
