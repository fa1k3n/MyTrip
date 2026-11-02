import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import { anthropicCall, CLOCK_DELAY_MS, type AiCall } from "../src/ai.ts";
import { FEATURES } from "../src/ai-features.ts";
import { AiClock } from "../src/worker.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const trip = (extra: object = {}) => ({
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], packing: [], places: [], bookings: [],
  purpose: "Höstlov i Berlin med bil.", aiConsent: { by: "Anna", at: "2026-11-01T10:00:00.000Z" }, aiHelpers: { prep: true },
  travelers: [{ id: "anna", name: "Anna", age: 41, packing: [] }, { id: "olle", name: "Olle", age: 9, packing: [] }],
  tasks: [{ id: "pass", text: "Förnya passet", done: false }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", location: "Berlin",
    legs: [{ vehicle: "car", origin: "Malmö", destination: "Berlin" }], activities: [] }],
  ...extra,
});
const task = (id: string, text: string, extra: object = {}) => ({ op: "add", path: "tasks/-", value: { id, text, done: false, url: "https://example.com/regel", ...extra } });
const reply = (ops: unknown[]) => ({
  id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops, reason: "Bra att veta" } }],
  usage: { input_tokens: 10_000, output_tokens: 2_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } },
});
const fake = (ops: unknown[]) => {
  const seen: Parameters<AiCall>[0][] = [];
  const f: AiCall = async (req) => { seen.push(structuredClone(req)); return reply(ops) as never; };
  return Object.assign(f, { seen });
};
const setup = async (ai: AiCall, t: object = trip(), settings: object = { ai: { enabled: true, areas: {} } }) => {
  const store = memoryStore([t]);
  await store.saveSettings(settings as never);
  const changed: string[] = [];
  const app = createApp(store, tokens, { aiService: true, ai: { call: ai }, onChange: async (id) => void changed.push(id) });
  return { store, app, changed };
};
const suggestions = async (app: App) => (await json(call(app, "/api/trips/berlin/proposals", "a")))
  .filter((p: { status: string; source?: { kind: string } }) => p.status === "pending" && p.source?.kind === "ai");
const person = async (app: App, id: string, role: string) => `person.berlin.${id}.${(await json(call(app, `/api/trips/berlin/people/${id}`, "a", "PUT", { role }))).secret}`;

// REQ: AI-70 each suggested task is its own proposal, marked as AI-generated, with its source link
test("AI-70 Bra att veta gives one proposal per task", async () => {
  const { app } = await setup(fake([task("dekal", "Beställ miljödekal (Umweltplakette)", { due: "2026-10-01" }), task("ehic", "Ta med EU-kortet")]));
  assert.equal((await call(app, "/api/trips/berlin/ai/prep", "a", "POST")).status, 202);
  const ps = await suggestions(app);
  assert.equal(ps.length, 2);
  for (const p of ps) {
    assert.equal(p.ops.length, 1);
    assert.equal(p.ops[0].value.ai, true, "marked as AI-generated (AI-02)");
    assert.equal(p.ops[0].value.url, "https://example.com/regel");
    assert.equal(p.source.item, true);
  }
  assert.equal((await call(app, `/api/trips/berlin/proposals/${ps[0].id}/approve`, "a", "POST")).status, 200);
  assert.deepEqual((await json(call(app, "/api/trips/berlin", "a"))).tasks.map((k: { id: string }) => k.id), ["pass", "dekal"]);
});

// REQ: AI-70 a suggestion like a task on the list, a pending one or a rejected one is not suggested again, and the service is told what to avoid
test("AI-70 no repeated suggestions", async () => {
  const ai = fake([task("x1", "Förnya passet"), task("x2", "Beställ miljödekal")]);
  const { app } = await setup(ai);
  await call(app, "/api/trips/berlin/ai/prep", "a", "POST");
  const [p] = await suggestions(app);
  assert.equal(p.ops[0].value.text, "Beställ miljödekal", "the task already on the list is dropped");
  await call(app, `/api/trips/berlin/proposals/${p.id}/reject`, "a", "POST");
  await call(app, "/api/trips/berlin/ai/prep", "a", "POST");
  assert.equal((await suggestions(app)).length, 0, "the rejected one does not come back");
  const sent = JSON.stringify(ai.seen[1]!.messages[0]!.content);
  assert.match(sent, /<avoid>/);
  assert.match(sent, /Beställ miljödekal/);
  assert.match(sent, /Förnya passet/);
});

// REQ: AI-69 after a change the server runs the helpers that are on, only when the data they use changed
test("AI-69 aiTick runs on changed data only", async () => {
  const ai = fake([task("dekal", "Beställ miljödekal")]);
  const { app, changed } = await setup(ai);
  await app.aiTick("berlin");
  assert.equal(ai.seen.length, 1);
  await app.aiTick("berlin");
  assert.equal(ai.seen.length, 1, "nothing changed: no call");
  await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: 1, ops: [{ op: "set", path: "tasks/0/done", value: true }], reason: "tick" });
  assert.deepEqual(changed, ["berlin"], "a save tells the timer");
  await app.aiTick("berlin");
  assert.equal(ai.seen.length, 1, "a ticked task is not data the helper uses");
  await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: 2, ops: [{ op: "set", path: "days/0/location", value: "Hamburg" }], reason: "place" });
  await app.aiTick("berlin");
  assert.equal(ai.seen.length, 2, "a new place runs it again");
});

// REQ: AI-69 a helper that is off, a trip without agreement or with AI off is not run
test("AI-69 aiTick respects the switches and the agreement", async () => {
  for (const extra of [{ aiHelpers: {} }, { aiConsent: undefined }, { ai: false }]) {
    const ai = fake([task("dekal", "Beställ miljödekal")]);
    const { app } = await setup(ai, trip(extra));
    await app.aiTick("berlin");
    assert.equal(ai.seen.length, 0, JSON.stringify(extra));
  }
});

// REQ: AI-69 AI-03 an automatic run counts against the trip's Skapare
test("AI-69 automatic runs are paid by the owner", async () => {
  const { app, store } = await setup(fake([task("dekal", "Beställ miljödekal")]));
  await store.saveOwner("berlin", "eva");
  await app.aiTick("berlin");
  assert.deepEqual((await store.aiUses()).map((x) => x.who), ["eva"]);
});

// REQ: AI-68 AI-72 the helpers' state: whether each can run and is on, when it last ran, and about how many runs are left
test("AI-68 AI-72 helper status", async () => {
  const { app } = await setup(fake([task("dekal", "Beställ miljödekal")]), trip(), { ai: { enabled: true, areas: {}, capAccountUsd: 0.3 } });
  const before = await json(call(app, "/api/trips/berlin/ai", "a"));
  assert.deepEqual(before.helpers.prep, { available: true, on: true, remaining: 2 }, "0.3 USD at the estimate of 0.15 a run");
  await call(app, "/api/trips/berlin/ai/prep", "a", "POST");
  const after = (await json(call(app, "/api/trips/berlin/ai", "a"))).helpers.prep;
  assert.equal(after.result, "proposal");
  assert.equal(typeof after.at, "string");
  assert.equal(after.remaining, 2, "0.22 USD left at 0.08 a run");
  assert.equal((await call(app, "/api/trips/berlin/ai", await person(app, "olle", "traveler"))).status, 403);
  const off = await setup(fake([]), trip(), { ai: { enabled: true, areas: { web: false } } });
  assert.equal((await json(call(off.app, "/api/trips/berlin/ai", "a"))).helpers.prep.available, false, "Bra att veta searches the web");
});

// REQ: AI-73 through Cloudflare AI Gateway with Unified Billing: the gateway address and token, and no Anthropic key
test("AI-73 anthropicCall through the gateway", async () => {
  let seen: { url: string; headers: Headers } | undefined;
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), headers: new Headers(init?.headers) };
    return new Response(JSON.stringify(reply([])), { headers: { "content-type": "application/json" } });
  };
  const gw = "https://gateway.ai.cloudflare.com/v1/acc/gw/anthropic";
  await anthropicCall({ gateway: { url: gw, token: "cf-token" }, fetch })({ model: "claude-opus-5-5", max_tokens: 10, messages: [{ role: "user", content: "x" }] });
  assert.ok(seen!.url.startsWith(`${gw}/v1/messages`));
  assert.equal(seen!.headers.get("cf-aig-authorization"), "Bearer cf-token");
  assert.equal(seen!.headers.get("x-api-key"), null);
  assert.equal(seen!.headers.get("authorization"), null);
});

// REQ: AI-69 on Cloudflare each change moves the trip's timer 10 minutes ahead
test("AI-69 the trip's timer", async () => {
  const kept = new Map<string, unknown>();
  let alarm = 0;
  const state = { storage: { get: async (k: string) => kept.get(k), put: async (k: string, v: unknown) => void kept.set(k, v), setAlarm: async (t: number) => { alarm = t; } } };
  const clock = new AiClock(state as never, {} as never);
  const before = Date.now();
  assert.equal((await clock.fetch(new Request("https://clock/berlin", { method: "POST" }))).status, 204);
  assert.equal(kept.get("trip"), "berlin");
  assert.ok(alarm >= before + CLOCK_DELAY_MS && alarm <= Date.now() + CLOCK_DELAY_MS);
  assert.equal(CLOCK_DELAY_MS, 10 * 60_000);
});

// REQ: AI-70 the helper only adds tasks
test("AI-70 the prep helper allows only new tasks", () => {
  const f = FEATURES.prep!;
  assert.equal(f.allows({ op: "add", path: "tasks/-", value: {} }), true);
  assert.equal(f.allows({ op: "remove", path: "tasks/0" }), false);
  assert.equal(f.allows({ op: "add", path: "dreams/-", value: {} }), false);
  assert.equal(f.web, true);
});

// REQ: AI-69 the D1 store keeps each helper's latest run per trip
test("AI-69 D1 keeps the helper state", async () => {
  const { sqliteD1 } = await import("./helpers/sqlite-d1.ts");
  const { d1Store } = await import("../src/d1-store.ts");
  const store = d1Store(sqliteD1());
  assert.equal(await store.aiHelper("berlin", "prep"), undefined);
  await store.saveAiHelper("berlin", "prep", { at: "2026-11-02T10:00:00.000Z", result: "nothing", fingerprint: "a" });
  await store.saveAiHelper("berlin", "prep", { at: "2026-11-02T11:00:00.000Z", result: "proposal", fingerprint: "b" });
  assert.deepEqual(await store.aiHelper("berlin", "prep"), { at: "2026-11-02T11:00:00.000Z", result: "proposal", fingerprint: "b" });
});

// REQ: AI-68 AI-64 turning a helper on asks for the agreement and turns it on in the same change
test("AI-68 consent turns the helper on", async () => {
  const { app } = await setup(fake([]), trip({ aiConsent: undefined, aiHelpers: undefined }));
  assert.equal((await call(app, "/api/trips/berlin/ai/consent", "a", "POST", { helper: "prep" })).status, 200);
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual(t.aiHelpers, { prep: true });
  assert.equal(t.revision, 2);
  await call(app, "/api/trips/berlin/ai/consent", "a", "POST", { helper: "kitchen" });
  assert.deepEqual((await json(call(app, "/api/trips/berlin", "a"))).aiHelpers, { prep: true }, "only real helpers");
});

// REQ: AI-74 with the trip's AI switch off a helper is still listed, so the app shows it greyed, and the status says whether AI is on for the instance
test("AI-74 status with the trip's switch off", async () => {
  const { app } = await setup(fake([]), trip({ ai: false }));
  const r = await json(call(app, "/api/trips/berlin/ai", "a"));
  assert.equal(r.enabled, true);
  assert.equal(r.helpers.prep.available, true);
  const off = await setup(fake([]), trip(), { ai: { enabled: false, areas: {} } });
  assert.equal((await json(call(off.app, "/api/trips/berlin/ai", "a"))).enabled, false);
});

// REQ: AI-10 a trip from "Beskriv din dröm": the description is the purpose, unchanged, and the draft fills in title, travelers and days (AI-78)
test("AI-10 a draft trip from the description", async () => {
  const days = [0, 1].map((i) => ({ op: "add", path: "days/-", value: { id: `d${i}`, date: `2027-10-2${6 + i}`, title: i ? "Hamburg" : "Malmö–Hamburg", summary: "Bil söderut.",
    icons: ["🚗"], start: "09:00", end: "18:00", location: "Hamburg", legs: i ? [] : [{ vehicle: "car", origin: "Malmö", destination: "Hamburg" }], activities: [] } }));
  const ai = fake([{ op: "set", path: "title", value: "Höstlov i Hamburg" }, { op: "add", path: "travelers/-", value: { id: "barn-7", name: "Barn (7 år)", age: 7, packing: [] } }, ...days]);
  const store = memoryStore([]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const app = createApp(store, tokens, { aiService: true, ai: { call: ai } });
  const description = "Vi vill åka till Hamburg på höstlovet med barnen, som är 7 och 10 år.";
  const t = await json(call(app, "/api/trips", "a", "POST", { title: "Ny resa", purpose: description }));
  await call(app, `/api/trips/${t.id}/ai/consent`, "a", "POST");
  assert.equal((await call(app, `/api/trips/${t.id}/ai/draft`, "a", "POST")).status, 200);
  assert.match(JSON.stringify(ai.seen[0]!.messages[0]!.content), /<today>\d{4}-\d\d-\d\d<\/today>/, "the date, to place the trip in time");
  const after = await json(call(app, `/api/trips/${t.id}`, "a"));
  assert.equal(after.title, "Höstlov i Hamburg");
  assert.equal(after.purpose, description);
  assert.equal(after.days.length, 2);
  assert.equal(after.travelers[0].age, 7);
});

// REQ: AI-10 the draft only fills a new trip: title, travelers, days and timeline, never the purpose or removals
test("AI-10 what the draft may change", () => {
  const f = FEATURES.draft!;
  assert.equal(f.area, "changes");
  for (const path of ["title", "travelers/-", "days/-", "stops/-"]) assert.equal(f.allows({ op: path === "title" ? "set" : "add", path, value: {} }), true, path);
  assert.equal(f.allows({ op: "set", path: "purpose", value: "x" }), false);
  assert.equal(f.allows({ op: "remove", path: "days/0" }), false);
  assert.equal(f.helper, undefined);
});

// REQ: AI-10 a draft day's icons are ids the app draws (UI-08): emoji become the day's means of transport, or Resa
test("AI-10 the draft's day icons", () => {
  const f = FEATURES.draft!;
  const day = (icons: string[], legs: object[] = []) => ({ op: "add" as const, path: "days/-", value: { id: "d0", date: "2027-10-25", title: "Hamburg", summary: "S.", icons, start: "09:00", end: "18:00", legs, activities: [] } });
  const icons = (o: ReturnType<typeof day>) => (f.tidy!(o).value as { icons: string[] }).icons;
  assert.deepEqual(icons(day(["Museum", "car"])), ["Museum", "car"]);
  assert.deepEqual(icons(day(["🏙️"])), ["Resa"]);
  assert.deepEqual(icons(day(["🚗"], [{ vehicle: "car", origin: "Malmö", destination: "Hamburg" }])), ["car"]);
  assert.deepEqual(icons(day(["Stad", "Museum"])), ["Museum"]);
});
