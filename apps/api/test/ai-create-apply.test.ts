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
const day = (i: number) => ({ id: `d${i}`, date: `2027-10-2${5 + i}`, title: "Hamburg", summary: "S.", icons: ["car"], start: "09:00", end: "18:00", location: "Hamburg", legs: [], activities: [] });
const draft = [{ op: "set", path: "title", value: "Höstlov i Hamburg" }, ...[0, 1, 2].map((i) => ({ op: "add", path: "days/-", value: day(i) }))];
const wishes = [
  { op: "add", path: "places/-", value: { id: "hagenbeck", name: "Tierpark Hagenbeck", address: "Lokstedter Grenzstraße 2, 22527 Hamburg", website: "https://www.hagenbeck.de/", notes: "Öppet 9–18" } },
  { op: "add", path: "dreams/-", value: { id: "zoo", title: "Tierpark Hagenbeck", category: "Aktivitet", url: "https://www.hagenbeck.de/" } },
  { op: "add", path: "days/1/activities/-", value: { id: "a-zoo", text: "Tierpark Hagenbeck", dreamId: "zoo", placeIds: ["hagenbeck"], category: "Aktivitet", start: "10:00", durationMin: 180, travel: { vehicle: "transit", durationMin: 30 } } },
];
const prep = [{ op: "add", path: "tasks/-", value: { id: "dekal", text: "Beställ miljödekal", done: false, url: "https://example.com/d" } }];
/** A new trip made with AI: the fake service answers the draft, then the helpers by their instructions. */
const made = async () => {
  const store = memoryStore([]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const ai: AiCall = async (req) => { const sys = JSON.stringify(req.system);
    return reply(sys.includes("first draft") ? draft : sys.includes("would love") ? wishes : prep) as never; };
  const app = createApp(store, tokens, { aiService: true, ai: { call: ai } });
  const t = await json(call(app, "/api/trips", "POST", { title: "Ny resa", purpose: "Hamburg med barnen. Djur och båtar." }));
  await call(app, `/api/trips/${t.id}/ai/consent`, "POST");
  return { app, id: t.id as string };
};

// REQ: AI-80 the helpers' first run right after the draft is applied at once, marked as AI
test("AI-80 the first run after Skapa med AI is applied", async () => {
  const { app, id } = await made();
  await call(app, `/api/trips/${id}/ai/draft`, "POST");
  const r = await call(app, `/api/trips/${id}/ai/wishes`, "POST", { apply: true });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).applied, { activities: 1, tasks: 0, bookings: 0, wishes: 1 });
  const p = await json(call(app, `/api/trips/${id}/ai/prep`, "POST", { apply: true }));
  assert.deepEqual(p.applied, { activities: 0, tasks: 1, bookings: 0, wishes: 0 });
  const t = await json(call(app, `/api/trips/${id}`));
  assert.equal(t.dreams[0].ai, true);
  assert.equal(t.tasks[0].ai, true);
  const zoo = t.days[1].activities[0];
  assert.equal(zoo.ai, true, "the activity is marked as AI");
  assert.deepEqual(zoo.placeIds, ["hagenbeck"]);
  assert.equal(t.places[0].address, "Lokstedter Grenzstraße 2, 22527 Hamburg");
  assert.equal((await json(call(app, `/api/trips/${id}/proposals`))).filter((x: { status: string }) => x.status === "pending").length, 0);
  const again = await call(app, `/api/trips/${id}/ai/prep`, "POST", { apply: true });
  assert.equal((await again.json()).applied, undefined, "a later run makes proposals");
});

// REQ: AI-80 without an applied draft, asking to apply makes proposals as always
test("AI-80 only after the draft", async () => {
  const { app, id } = await made();
  const t = await json(call(app, `/api/trips/${id}`));
  await call(app, `/api/trips/${id}/changes`, "POST", { baseRevision: t.revision, ops: [{ op: "add", path: "days/-", value: day(1) }], reason: "day" });
  const r = await json(call(app, `/api/trips/${id}/ai/prep`, "POST", { apply: true }));
  assert.equal(r.applied, undefined);
  assert.equal(r.proposalIds.length, 1);
});

// REQ: AI-81 a suggested wish comes with its place, linked from the activity, and the ids stay linked when they are made unique
test("AI-81 the place goes with the suggestion", () => {
  const f = FEATURES.wishes!;
  assert.equal(f.allows({ op: "add", path: "places/-", value: {} }), true);
  const g = f.helper!.group!(wishes.map((o) => f.helper!.finish(f.tidy!(o as never))) as never);
  assert.deepEqual(g[0]!.map((o) => o.path), ["dreams/-", "days/1/activities/-", "places/-"]);
  assert.equal((g[0]![1]!.value as { ai: boolean }).ai, true);
});
