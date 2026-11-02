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
const day = (i: number) => ({ id: `d${i}`, date: `2027-10-2${5 + i}`, title: i === 0 ? "Färjan till Kiel" : "Hamburg", summary: "S.", icons: ["car"], start: "09:00", end: "18:00", location: "Hamburg", legs: [], activities: [] });
const draft = [{ op: "set", path: "title", value: "Höstlov i Hamburg" }, ...[0, 1, 2].map((i) => ({ op: "add", path: "days/-", value: day(i) }))];
const wishes = [
  { op: "add", path: "dreams/-", value: { id: "zoo", title: "Tierpark Hagenbeck", category: "Aktivitet", url: "https://www.hagenbeck.de/" } },
  { op: "add", path: "days/1/activities/-", value: { id: "a-zoo", text: "Tierpark Hagenbeck", dreamId: "zoo", placeIds: [], category: "Aktivitet", start: "10:00", durationMin: 180 } },
  { op: "add", path: "dreams/-", value: { id: "hamn", title: "Hamnrundtur", category: "Utsikt", url: "https://example.com/hamn" } },
  { op: "add", path: "days/1/activities/-", value: { id: "a-hamn", text: "Hamnrundtur", dreamId: "hamn", placeIds: [], category: "Utsikt", start: "15:00", durationMin: 60 } },
  { op: "set", path: "days/1/title", value: "Hagenbeck och hamnrundtur" },
  { op: "set", path: "days/2/title", value: "Ingen aktivitet här" },
];
const made = async () => {
  const store = memoryStore([]);
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const ai: AiCall = async (req) => reply(JSON.stringify(req.system).includes("first draft") ? draft : wishes) as never;
  const app = createApp(store, tokens, { aiService: true, ai: { call: ai } });
  const t = await json(call(app, "/api/trips", "POST", { title: "Ny resa", purpose: "Hamburg med barnen." }));
  await call(app, `/api/trips/${t.id}/ai/consent`, "POST");
  await call(app, `/api/trips/${t.id}/ai/draft`, "POST");
  return { app, id: t.id as string };
};

// REQ: AI-86 the draft's day titles are marked as AI titles, and the draft is asked for titles about what the day holds
test("AI-86 the draft marks its titles", async () => {
  const { app, id } = await made();
  const t = await json(call(app, `/api/trips/${id}`));
  assert.deepEqual(t.days.map((d: { aiTitle?: boolean }) => d.aiTitle), [true, true, true]);
  assert.match(FEATURES.draft!.task, /at most 40 characters/);
  assert.match(FEATURES.wishes!.task, /days\/<index>\/title/);
});

// REQ: AI-86 the wish helper retitles a day with an AI title where it puts activities, with the day's first suggestion; other title changes are dropped
test("AI-86 a day gets a title from its activities", async () => {
  const { app, id } = await made();
  const r = await json(call(app, `/api/trips/${id}/ai/wishes`, "POST", { apply: true }));
  assert.deepEqual(r.applied, { activities: 2, tasks: 0, bookings: 0, wishes: 2 });
  const t = await json(call(app, `/api/trips/${id}`));
  assert.deepEqual(t.days.map((d: { title: string }) => d.title), ["Färjan till Kiel", "Hagenbeck och hamnrundtur", "Hamburg"]);
  assert.equal(t.days[1].aiTitle, true, "still an AI title");
});

// REQ: AI-86 a later run proposes the title together with the day's first suggestion; a title a person changed is never replaced
test("AI-86 the title goes with a proposal, and a changed title stays", async () => {
  const { app, id } = await made();
  const ps = await json(call(app, `/api/trips/${id}/ai/wishes`, "POST"));
  const all = await json(call(app, `/api/trips/${id}/proposals`));
  const mine = all.filter((p: { id: string }) => ps.proposalIds.includes(p.id)).map((p: { ops: { op: string; path: string }[] }) => p.ops.map((o) => `${o.op} ${o.path}`));
  assert.deepEqual(mine, [["add dreams/-", "add days/1/activities/-", "set days/1/title"], ["add dreams/-", "add days/1/activities/-"]]);

  const { app: app2, id: id2 } = await made();
  const t = await json(call(app2, `/api/trips/${id2}`));
  await call(app2, `/api/trips/${id2}/changes`, "POST", { baseRevision: t.revision, ops: [{ op: "set", path: "days/1", value: { ...t.days[1], title: "Vår egen dag", aiTitle: undefined } }], reason: "title" });
  await call(app2, `/api/trips/${id2}/ai/wishes`, "POST", { apply: true });
  assert.equal((await json(call(app2, `/api/trips/${id2}`))).days[1].title, "Vår egen dag");
});

// REQ: AI-86 a title over 40 characters is not used
test("AI-86 too long a title", () => {
  const f = FEATURES.wishes!, t = { days: [{ ...day(1), aiTitle: true }] };
  const ops = [wishes[0]!, wishes[1]!, { op: "set", path: "days/0/title", value: "x".repeat(41) }].map((o) => o.path.endsWith("/-") ? { ...o, path: o.path.replace("days/1", "days/0") } : o);
  const g = f.helper!.group!(ops.map((o) => f.helper!.finish(o as never)) as never, t as never);
  assert.deepEqual(g.flat().map((o) => o.path), ["dreams/-", "days/0/activities/-"]);
});
