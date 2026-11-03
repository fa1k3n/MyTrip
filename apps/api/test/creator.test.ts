import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import type { AiCall } from "../src/ai.ts";
import { FEATURES } from "../src/ai-features.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) => app.request(path, {
  method: init.method ?? "GET",
  headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.1", ...(init.cookie ? { cookie: init.cookie } : {}) },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const cookieOf = (r: Response) => (r.headers.getSetCookie().find((x) => x.startsWith("session=")) ?? "").split(";")[0]!;
const reply = (ops: unknown[]) => ({
  id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "propose_change", input: { ops, reason: "Förslag" } }],
  usage: { input_tokens: 10, output_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } },
});

/** The app with the admin password session, and an AI service that answers with the given ops and keeps what it was sent. */
async function setup(ops: unknown[] = []) {
  const store = memoryStore([]), sent: string[] = [];
  await store.saveSettings({ ai: { enabled: true, areas: {} } } as never);
  const ai: AiCall = async (req) => { sent.push(JSON.stringify(req)); return reply(ops) as never; };
  const app = createApp(store, tokens, { auth, aiService: true, ai: { call: ai } });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  return { store, app, admin, sent };
}
/** Creates an account as the admin and sets its password; returns its session cookie. The first account is the superuser. */
async function account(app: App, admin: string, name: string, email: string) {
  const { user, setup } = await json(call(app, "/api/users", { method: "POST", cookie: admin, body: { name, email } }));
  const done = await call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: setup.secret, password: "ett långt lösenord" } });
  return cookieOf(done);
}

// REQ: US-39 the creator of a trip is its first traveler, a Planerare tied to their account
test("US-39 a new trip has its creator as a Planerare", async () => {
  const { app, admin } = await setup();
  await account(app, admin, "Eva", "eva@example.org");
  const olle = await account(app, admin, "Olle Svensson", "olle@example.org");
  const t = await json(call(app, "/api/trips", { method: "POST", cookie: olle, body: { title: "Olles resa" } }));
  assert.deepEqual(t.travelers.map((x: { name: string }) => x.name), ["Olle"]); // the first name
  const people = await json(call(app, `/api/trips/${t.id}/people`, { cookie: olle }));
  assert.deepEqual(people.map((p: { travelerId: string; role: string; account: string }) => [p.travelerId, p.role, p.account]), [[t.travelers[0].id, "planner", "olle@example.org"]]);
});

// REQ: US-39 with the admin password the first superuser is the creator; without an account nobody is added
test("US-39 the admin password: the first superuser, or nobody", async () => {
  const { app, admin } = await setup();
  assert.deepEqual((await json(call(app, "/api/trips", { method: "POST", cookie: admin, body: { title: "Utan konto" } }))).travelers, []);
  await account(app, admin, "Johan", "johan@example.org");
  const t = await json(call(app, "/api/trips", { method: "POST", cookie: admin, body: { title: "Med konto" } }));
  assert.deepEqual(t.travelers.map((x: { name: string }) => x.name), ["Johan"]);
});

// REQ: US-40 an owner tied to a traveler shows Skapare and the traveler's permission
test("US-40 the creator is Skapare and Planerare", async () => {
  const { app, admin } = await setup();
  await account(app, admin, "Eva", "eva@example.org");
  const olle = await account(app, admin, "Olle", "olle@example.org");
  const t = await json(call(app, "/api/trips", { method: "POST", cookie: olle, body: { title: "Olles resa" } }));
  assert.deepEqual((await json(call(app, "/api/me", { cookie: olle }))).trips[t.id], { role: "owner", roles: ["owner", "planner"], travelerId: t.travelers[0].id });
  await call(app, `/api/trips/${t.id}/people/${t.travelers[0].id}`, { method: "PUT", cookie: olle, body: { role: "traveler" } });
  assert.deepEqual((await json(call(app, "/api/me", { cookie: olle }))).trips[t.id].roles, ["owner", "traveler"]);
});

// REQ: AI-94 the draft counts the creator as the writer: applied at once, adds only the others, never sends the creator's name
test("AI-94 the draft keeps the creator and adds the others", async () => {
  const day = { id: "d1", date: "2027-12-12", title: "Till Göteborg", summary: "S.", icons: ["car"], start: "09:00", end: "18:00", location: "Göteborg", legs: [], activities: [] };
  const { app, admin, sent } = await setup([{ op: "set", path: "title", value: "Göteborg i december" },
    { op: "add", path: "travelers/-", value: { id: "anna", name: "Anna", packing: [] } }, { op: "add", path: "days/-", value: day }]);
  const olle = await account(app, admin, "Olle", "olle@example.org"); // the superuser, who may use AI
  const t = await json(call(app, "/api/trips", { method: "POST", cookie: olle, body: { title: "Ny resa", purpose: "Olle och Anna åker till Göteborg." } }));
  await call(app, `/api/trips/${t.id}/ai/consent`, { method: "POST", cookie: olle });
  const r = await json(call(app, `/api/trips/${t.id}/ai/draft`, { method: "POST", cookie: olle }));
  assert.equal(r.applied, true); // the creator alone does not make the trip "not empty" (AI-78)
  const after = await json(call(app, `/api/trips/${t.id}`, { cookie: olle }));
  assert.deepEqual(after.travelers.map((x: { name: string }) => x.name), ["Olle", "Anna"]);
  assert.ok(!sent.join("").includes("Olle"), "the creator's name never reaches the AI service (AI-04)");
  assert.match(FEATURES.draft!.instructions, /r1/); // the AI is told that r1 wrote the description
});
