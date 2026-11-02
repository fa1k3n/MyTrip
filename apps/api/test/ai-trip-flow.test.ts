import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import type { AiCall } from "../src/ai.ts";
import { FEATURES } from "../src/ai-features.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const reply = (ops: unknown[]) => ({
  id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops, reason: "Förslag" } }],
  usage: { input_tokens: 10_000, output_tokens: 2_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } },
});
const fake = (ops: unknown[]): AiCall => async () => reply(ops) as never;
const day = (i: number, extra: object = {}) => ({ id: `d${i}`, date: `2027-10-2${5 + i}`, title: i ? "Hamburg" : "Malmö–Hamburg", summary: "S.",
  icons: ["car"], start: "09:00", end: "18:00", location: "Hamburg", legs: [], activities: [], ...extra });
const draftOps = [{ op: "set", path: "title", value: "Höstlov i Hamburg" }, { op: "add", path: "travelers/-", value: { id: "vuxen-1", name: "Vuxen 1", packing: [] } },
  ...[0, 1, 2].map((i) => ({ op: "add", path: "days/-", value: day(i) })), { op: "add", path: "stops/-", value: { label: "Hamburg", sub: "Tre nätter", dayId: "d1" } }];
const newTrip = async (ops: unknown[]) => {
  const store = memoryStore([]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const app = createApp(store, tokens, { aiService: true, ai: { call: fake(ops) } });
  const t = await json(call(app, "/api/trips", "a", "POST", { title: "Ny resa", purpose: "Hamburg på höstlovet med barnen. Djur och båtar." }));
  await call(app, `/api/trips/${t.id}/ai/consent`, "a", "POST");
  return { app, id: t.id as string, store };
};

// REQ: AI-78 the draft of a new, empty trip is applied at once; pressing "Skapa med AI" is the approval
test("AI-78 the draft is applied at once", async () => {
  const { app, id } = await newTrip(draftOps);
  const before = await json(call(app, `/api/trips/${id}`, "a"));
  const r = await call(app, `/api/trips/${id}/ai/draft`, "a", "POST");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.applied, true);
  assert.equal(body.revision, before.revision + 1);
  const after = await json(call(app, `/api/trips/${id}`, "a"));
  assert.equal(after.title, "Höstlov i Hamburg");
  assert.equal(after.days.length, 3);
  assert.equal(after.purpose, before.purpose, "the description stays the purpose");
  const ps = await json(call(app, `/api/trips/${id}/proposals`, "a"));
  assert.deepEqual(ps.map((p: { status: string }) => p.status), ["approved"], "kept as an approved proposal, nothing left to review");
});

// REQ: AI-78 a trip that already has content keeps the draft as a proposal
test("AI-78 not on a trip with content", async () => {
  const { app, id } = await newTrip(draftOps);
  const t = await json(call(app, `/api/trips/${id}`, "a"));
  await call(app, `/api/trips/${id}/changes`, "a", "POST", { baseRevision: t.revision, ops: [{ op: "add", path: "tasks/-", value: { id: "pass", text: "Pass", done: false } }], reason: "task" });
  const r = await call(app, `/api/trips/${id}/ai/draft`, "a", "POST");
  assert.equal(r.status, 202);
  assert.equal((await r.json()).applied, undefined);
  assert.equal((await json(call(app, `/api/trips/${id}`, "a"))).title, "Ny resa");
});

const wish = (id: string, title: string) => ({ op: "add", path: "dreams/-", value: { id, title, category: "Aktivitet", url: "https://example.com/" + id } });
const act = (dayIndex: number, id: string, dreamId: string, text: string) => ({ op: "add", path: `days/${dayIndex}/activities/-`, value: { id, text, dreamId, category: "Aktivitet", durationMin: 120 } });
const withDays = async (ops: unknown[]) => {
  const t = { id: "hh", revision: 1, title: "Hamburg", timezone: "Europe/Berlin", stops: [], places: [], bookings: [], tasks: [], purpose: "Djur och båtar.",
    aiConsent: { by: "Anna", at: "2026-11-01T10:00:00.000Z" }, travelers: [{ id: "olle", name: "Olle", age: 7, packing: [] }], days: [day(0), day(1), day(2)] };
  const store = memoryStore([t]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  return createApp(store, tokens, { aiService: true, ai: { call: fake(ops) } });
};
const pending = async (app: App) => (await json(call(app, "/api/trips/hh/proposals", "a"))).filter((p: { status: string }) => p.status === "pending");

// REQ: AI-71 the wish helper runs on its own, without its switch being turned on, and each suggestion is its own proposal marked as AI
// REQ: AI-77 each suggested wish comes with its activity on a fitting day, in the same proposal
test("AI-71 AI-77 suggested wishes with their activities", async () => {
  const app = await withDays([wish("hagenbeck", "Tierpark Hagenbeck"), act(1, "a-hagenbeck", "hagenbeck", "Tierpark Hagenbeck"),
    wish("hamnen", "Hamnrundtur"), act(2, "a-hamnen", "hamnen", "Hamnrundtur med båt")]);
  assert.equal((await call(app, "/api/trips/hh/ai/wishes", "a", "POST")).status, 202);
  const ps = await pending(app);
  assert.equal(ps.length, 2);
  for (const p of ps) {
    assert.equal(p.ops.length, 2, "the wish and its activity together");
    assert.equal(p.source.item, true);
    assert.equal(p.ops[0].value.ai, true);
    assert.equal(p.ops[0].value.votes, 0);
  }
  assert.equal(ps[0].source.day, "d1");
  assert.equal((await json(call(app, "/api/trips/hh", "a"))).aiHelpers?.wishes, undefined, "the switch stays as it was (AI-79)");
  assert.equal((await call(app, `/api/trips/hh/proposals/${ps[1].id}/approve`, "a", "POST")).status, 200);
  const t = await json(call(app, "/api/trips/hh", "a"));
  assert.deepEqual(t.dreams.map((w: { id: string }) => w.id), ["hamnen"]);
  assert.deepEqual(t.days[2].activities.map((a: { dreamId: string }) => a.dreamId), ["hamnen"]);
  assert.equal(t.days[2].activities[0].estimated, true);
});

// REQ: AI-77 a suggestion follows its day when days move, and says it no longer fits when the day is gone
test("AI-77 the suggestion's day", async () => {
  const app = await withDays([wish("hagenbeck", "Tierpark Hagenbeck"), act(1, "a-hagenbeck", "hagenbeck", "Tierpark Hagenbeck"),
    wish("hamnen", "Hamnrundtur"), act(2, "a-hamnen", "hamnen", "Hamnrundtur")]);
  await call(app, "/api/trips/hh/ai/wishes", "a", "POST");
  const [p1, p2] = await pending(app);
  await call(app, "/api/trips/hh/changes", "a", "POST", { baseRevision: 1, ops: [{ op: "remove", path: "days/0" }], reason: "remove day" });
  assert.equal((await call(app, `/api/trips/hh/proposals/${p1.id}/approve`, "a", "POST")).status, 200);
  const t = await json(call(app, "/api/trips/hh", "a"));
  assert.deepEqual(t.days[0].activities.map((a: { id: string }) => a.id), ["a-hagenbeck"], "d1 is now the first day");
  await call(app, "/api/trips/hh/changes", "a", "POST", { baseRevision: t.revision, ops: [{ op: "remove", path: "days/1" }], reason: "remove day" });
  const r = await call(app, `/api/trips/hh/proposals/${p2.id}/approve`, "a", "POST");
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "day gone");
  assert.equal((await pending(app)).length, 0, "the suggestion that no longer fits is rejected");
});

// REQ: AI-71 a wish without an activity, or an activity on a day that does not exist, is not suggested
test("AI-71 only whole suggestions", () => {
  const f = FEATURES.wishes!;
  assert.equal(f.web, true);
  assert.equal(f.allows({ op: "add", path: "dreams/-", value: {} }), true);
  assert.equal(f.allows({ op: "add", path: "days/1/activities/-", value: {} }), true);
  assert.equal(f.allows({ op: "add", path: "tasks/-", value: {} }), false);
  assert.equal(f.allows({ op: "set", path: "days/1/activities/0", value: {} }), false);
  const groups = f.helper!.group!([wish("a", "A"), act(0, "x", "a", "A"), wish("b", "B")] as never);
  assert.deepEqual(groups.map((g) => g.length), [2], "B has no activity");
});

// REQ: BK-21 Bra att veta suggests what must be booked as bookings with the status Att boka; rules stay tasks
test("BK-21 bookings to book from the prep helper", async () => {
  const f = FEATURES.prep!;
  assert.equal(f.allows({ op: "add", path: "bookings/-", value: {} }), true);
  const book = { op: "add", path: "bookings/-", value: { id: "hotell", name: "Hotell med pool i Hamburg", kind: "stay", from: "2027-10-26", to: "2027-10-27", status: "tobook", url: "https://example.com/boka" } };
  const app = await withDays([book, { op: "add", path: "tasks/-", value: { id: "dekal", text: "Beställ miljödekal", done: false, url: "https://example.com/d" } }]);
  assert.equal((await call(app, "/api/trips/hh/ai/prep", "a", "POST")).status, 202);
  const ps = await pending(app);
  assert.equal(ps.length, 2);
  const b = ps.find((p: { ops: { path: string }[] }) => p.ops[0]!.path === "bookings/-");
  assert.equal(b.ops[0].value.status, "tobook");
  assert.equal(b.ops[0].value.ai, true);
  assert.equal((await call(app, `/api/trips/hh/proposals/${b.id}/approve`, "a", "POST")).status, 200);
  assert.equal((await json(call(app, "/api/trips/hh", "a"))).bookings[0].status, "tobook");
});
