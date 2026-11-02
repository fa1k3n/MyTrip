import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip, type Op } from "@trip/schema";
import { createApp, memoryStore } from "../src/app.ts";
import { aiView, type AiCall } from "../src/ai.ts";
import { FEATURES } from "../src/ai-features.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: "Bearer a" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const reply = (ops: unknown[]) => ({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops, reason: "Packlistor" } }],
  usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } } });
const day = (i: number) => ({ id: `d${i}`, date: `2027-10-2${5 + i}`, title: "Hamburg", summary: "S.", icons: ["car"], start: "09:00", end: "18:00", location: "Hamburg", legs: [], activities: [] });
const trip = (extra: object = {}) => Trip.parse({
  id: "t", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], bookings: [], days: [day(0), day(1)],
  travelers: [{ id: "anna", name: "Anna", age: 40, packing: ["Pass"] }, { id: "olle", name: "Olle", age: 7, packing: [] }], packing: ["Laddare"], ...extra,
});
const add = (path: string, value: string): Op => ({ op: "add", path, value });
const f = FEATURES.packing!;

// REQ: AI-89 the helper "Packlistor" writes a shared list and one per traveler, nothing else
test("AI-89 the packing helper", () => {
  assert.equal(f.area, "changes");
  assert.ok(f.helper, "a helper behind a switch");
  assert.ok(!f.web, "no web search");
  assert.ok(f.allows(add("packing/-", "Regnjackor")));
  assert.ok(f.allows(add("travelers/1/packing/-", "Gosedjur")));
  assert.ok(!f.allows(add("tasks/-", "x")) && !f.allows({ op: "set", path: "travelers/1/packing", value: [] }) && !f.allows(add("travelers/1/packed/-", "x")));
  assert.ok(!f.allows({ op: "add", path: "packing/-", value: { text: "x" } }), "an item is a short text");
  assert.match(f.instructions, /age/);
  assert.match(f.task, /travelers\/<index>\/packing\/-/);
});

// REQ: AI-89 one suggestion per list, without what the list already has, each item marked as AI
test("AI-89 grouped by list and marked", () => {
  const t = trip();
  const ops = [add("packing/-", "Regnjackor"), add("packing/-", "laddare"), add("travelers/0/packing/-", "Pass"), add("travelers/0/packing/-", "Läsglasögon"),
    add("travelers/1/packing/-", "Gosedjur"), add("travelers/1/packing/-", "gosedjur"), add("travelers/1/packing/-", "Regnjackor")].map(f.helper!.finish);
  const groups = f.helper!.group!(ops, t);
  const mark = (path: string, value: string[]): Op => ({ op: "set", path, value }); // the list's AI marks, also when it has none yet
  assert.deepEqual(groups, [
    [add("packing/-", "Regnjackor"), mark("packingAi", ["Regnjackor"])],
    [add("travelers/0/packing/-", "Läsglasögon"), mark("travelers/0/packingAi", ["Läsglasögon"])],
    [add("travelers/1/packing/-", "Gosedjur"), add("travelers/1/packing/-", "Regnjackor"), mark("travelers/1/packingAi", ["Gosedjur", "Regnjackor"])],
  ]);
  assert.equal(f.helper!.textOf(groups[2]![0]!), "packing r2: Gosedjur");
  assert.ok(f.helper!.known(t).includes("packing r1: Pass") && f.helper!.known(t).includes("packing shared: Laddare"));
});

// REQ: AI-88 AI-89 the packing helper runs again when dates, places, means of transport, ages, purpose or activities change, not when a list does
test("AI-88 what the packing helper follows", () => {
  const fp = f.helper!.fingerprint, t = trip();
  assert.equal(fp(t), fp({ ...t, packing: [...t.packing, "Snacks"], travelers: t.travelers.map((x) => ({ ...x, packing: [...x.packing, "Mössa"] })) }));
  assert.notEqual(fp(t), fp({ ...t, travelers: t.travelers.map((x, i) => (i ? { ...x, age: 8 } : x)) }));
  assert.notEqual(fp(t), fp({ ...t, days: t.days.map((d, i) => (i ? { ...d, location: "Lübeck" } : d)) }));
  assert.notEqual(fp(t), fp({ ...t, purpose: "Skidresa" }));
});

// REQ: AI-89 AI-04 the AI service sees the lists, with the travelers as r1, r2 … and no names
test("AI-89 the lists in what is sent", () => {
  const { view } = aiView(trip());
  assert.deepEqual(view.packing, { shared: ["Laddare"], r1: ["Pass"], r2: [] });
  assert.ok(!JSON.stringify(view).includes("Anna") && !JSON.stringify(view).includes("Olle"));
});

// REQ: AI-80 AI-89 the packing lists are made at once after Skapa med AI, marked as AI; a later run makes proposals
test("AI-89 first run after Skapa med AI", async () => {
  const store = memoryStore([]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const draft = [{ op: "set", path: "title", value: "Höstlov i Hamburg" }, ...[0, 1].map((i) => ({ op: "add", path: "days/-", value: day(i) })),
    { op: "add", path: "travelers/-", value: { id: "vuxen-1", name: "Vuxen 1", age: 40, packing: [] } }, { op: "add", path: "travelers/-", value: { id: "barn", name: "Barn (7 år)", age: 7, packing: [] } }];
  const lists = [add("packing/-", "Regnjackor"), add("travelers/1/packing/-", "Gosedjur"), add("travelers/1/packing/-", "Mössa")];
  const ai: AiCall = async (req) => reply(JSON.stringify(req.system).includes("first draft") ? draft : lists) as never;
  const app = createApp(store, tokens, { aiService: true, ai: { call: ai } });
  const t0 = await json(call(app, "/api/trips", "POST", { title: "Ny resa", purpose: "Hamburg med barnet, sju år." }));
  await call(app, `/api/trips/${t0.id}/ai/consent`, "POST");
  await call(app, `/api/trips/${t0.id}/ai/draft`, "POST");
  const r = await json(call(app, `/api/trips/${t0.id}/ai/packing`, "POST", { apply: true }));
  assert.deepEqual(r.applied, { activities: 0, tasks: 0, bookings: 0, wishes: 0, packing: 3 });
  const t = await json(call(app, `/api/trips/${t0.id}`));
  assert.deepEqual([t.packing, t.packingAi], [["Regnjackor"], ["Regnjackor"]]);
  assert.deepEqual([t.travelers[1].packing, t.travelers[1].packingAi], [["Gosedjur", "Mössa"], ["Gosedjur", "Mössa"]]);
  const st = await json(call(app, `/api/trips/${t0.id}/ai`));
  assert.ok("packing" in st.helpers, "a switch in the trip's settings");
  const again = await json(call(app, `/api/trips/${t0.id}/ai/packing`, "POST", { apply: true }));
  assert.equal(again.applied, undefined, "a later run makes proposals");
});
