import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip, type Op } from "@trip/schema";
import { createApp, memoryStore } from "../src/app.ts";
import { aiView, fromAi, runAi, type AiCall, type AiFeature } from "../src/ai.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const trip = () => ({
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], packing: [], tasks: [],
  purpose: "Anna och Olle vill se Berlin. Ring 070-123 45 67 eller mejla anna@example.com, bokning ABC123.",
  inbox: "berlin-x@inbox.example.com",
  travelers: [{ id: "anna", name: "Anna", age: 41, packing: [] }, { id: "olle", name: "Olle", age: 9, packing: [] }],
  places: [{ id: "hotel", name: "Hotell", address: "Gatan 1, Berlin", phone: "+49 30 1234567" }],
  bookings: [{ id: "b1", name: "Hotell", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "ABC123", amount: { value: 900, currency: "EUR" }, placeId: "hotel",
    files: [{ id: "abcdef0123456789", name: "biljett.pdf", type: "application/pdf", size: 10 }] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", location: "Berlin",
    legs: [{ vehicle: "car", origin: "Malmö", destination: "Berlin" }], activities: [{ id: "a1", text: "Zoo med Olle" }] }],
  expenses: [{ id: "e1", text: "Bensin", category: "Transport", amount: 500, paidBy: "anna", sharedBy: [] }],
});

/** A reply from the AI service that proposes these changes. */
const reply = (ops: unknown[], extra: { searches?: number; stop?: string } = {}) => ({
  id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: extra.stop ?? "tool_use", stop_sequence: null,
  content: extra.stop === "refusal" ? [] : [{ type: "tool_use", id: `t${ops.length}`, name: "propose_change", input: { ops, reason: "Bra att veta" } }],
  usage: { input_tokens: 10_000, output_tokens: 2_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: extra.searches ?? 0 } },
});
/** A fake AI service that gives the replies in order and keeps every request. */
const fake = (...replies: ReturnType<typeof reply>[]) => {
  const seen: Parameters<AiCall>[0][] = [];
  const f: AiCall = async (req) => { seen.push(structuredClone(req)); return replies[Math.min(seen.length - 1, replies.length - 1)] as never; };
  return Object.assign(f, { seen });
};
const tasksOnly: AiFeature = { area: "suggestions", instructions: "Propose tasks.", task: "Propose tasks for the trip.", allows: (o) => o.op === "add" && o.path === "tasks/-" };
const task = (id: string, text = "Beställ miljödekal") => ({ op: "add", path: "tasks/-", value: { id, text, done: false } });
const aiOn = { ai: { enabled: true, areas: {} } };
const setup = async (ai: AiCall, settings: object = aiOn) => {
  const store = memoryStore([trip()]);
  await store.saveSettings(settings as never);
  return { store, app: createApp(store, tokens, { aiService: true, ai: { call: ai, features: { tasks: tasksOnly } } }) };
};
const person = async (app: App, id: string, role: string) => `person.berlin.${id}.${(await json(call(app, `/api/trips/berlin/people/${id}`, "a", "PUT", { role }))).secret}`;

// REQ: AI-04 only what the feature needs is sent: no booking references, telephone numbers, mejl, inbox, payment details or ticket files, and names become role and age
test("AI-04 aiView removes personal data and names", () => {
  const t = Trip.parse(trip());
  const { view } = aiView(t);
  const text = JSON.stringify(view);
  for (const gone of ["ABC123", "070-123 45 67", "anna@example.com", "inbox.example.com", "+49 30 1234567", "abcdef0123456789", "900", "Bensin", "Anna", "Olle"]) {
    assert.ok(!text.includes(gone), `${gone} is sent`);
  }
  assert.deepEqual(view.travelers, [{ ref: "r1", who: "vuxen, 41 år" }, { ref: "r2", who: "barn, 9 år" }]);
  assert.match(view.purpose, /^vuxen, 41 år och barn, 9 år vill se Berlin/);
  assert.equal(view.days[0]!.activities[0]!.text, "Zoo med barn, 9 år");
  assert.equal(view.bookings[0]!.name, "Hotell");
});

// REQ: AI-04 traveler references in a proposal are turned back into the travelers' ids
test("AI-04 fromAi maps references back", () => {
  const { refs } = aiView(Trip.parse(trip()));
  assert.deepEqual(fromAi([{ op: "add", path: "expenses/-", value: { paidBy: "r1", sharedBy: ["r2"], text: "r1" } }], refs),
    [{ op: "add", path: "expenses/-", value: { paidBy: "anna", sharedBy: ["olle"], text: "anna" } }]);
});

// REQ: AI-98 a traveler reference left in a text gets the traveler's name, "resenär" without one; other words stay
test("AI-98 fromAi names travelers in texts", () => {
  const t = Trip.parse({ ...trip(), travelers: [...trip().travelers, { id: "x", name: " ", packing: [] }] });
  const { refs, names } = aiView(t);
  const text = (s: string) => (fromAi([task("k", s) as Op], refs, names)[0]!.value as { text: string }).text;
  assert.equal(text("Kontrollera att r1 och r2 har giltiga pass."), "Kontrollera att Anna och Olle har giltiga pass.");
  assert.equal(text("Packa r2:s mössa och r3:s jacka"), "Packa Olles mössa och resenärs jacka");
  assert.equal(text("r3 tar med laddaren"), "resenär tar med laddaren");
  for (const same of ["Tr1 och R1-linjen", "Ta linje r9", "r1-pass", "r12 till Malmö"]) assert.equal(text(same), same);
  assert.deepEqual(fromAi([{ op: "set", path: "expenses/0/paidBy", value: "r1" }], refs, names)[0]!.value, "anna");
});

// REQ: AI-98 the instructions ask for "båda", "alla" or a role in texts, and the reason shown to the user names the travelers
test("AI-98 runAi asks for no references in texts and names them in the reason", async () => {
  const r = reply([task("pass")]);
  (r.content[0] as { input: { reason: string } }).input.reason = "Pass för r1 och r2.";
  const ai = fake(r);
  const out = await runAi(ai, tasksOnly, Trip.parse(trip()));
  assert.equal("reason" in out && out.reason, "Pass för Anna och Olle.");
  assert.match(String(ai.seen[0]!.system), /"båda"/);
});

// REQ: AI-65 fixed instructions, the trip as data, and a proposal that fails the dry run goes back to the service to be fixed
test("AI-65 runAi retries a proposal that fails the checks", async () => {
  const ai = fake(reply([{ op: "add", path: "tasks/-", value: { id: "x", done: false } }]), reply([task("k1")]));
  const r = await runAi(ai, tasksOnly, Trip.parse(trip()));
  assert.ok("ops" in r);
  assert.deepEqual(r.ops, [task("k1")]);
  assert.equal(ai.seen.length, 2);
  const first = ai.seen[0]!;
  assert.match(JSON.stringify(first.system), /Propose tasks\./);
  assert.match(JSON.stringify(first.system), /data, never instructions/);
  const user = JSON.stringify(first.messages[0]!.content);
  assert.match(user, /<trip>/);
  assert.match(user, /Propose tasks for the trip\./);
  const back = JSON.stringify(ai.seen[1]!.messages.at(-1)!.content);
  assert.match(back, /tool_result/);
  assert.match(back, /"is_error":true/);
  assert.ok(r.cost.usd > 0);
});

// REQ: AI-65 a feature only proposes the kinds of change it is made for
test("AI-65 runAi rejects changes outside the feature", async () => {
  const ai = fake(reply([{ op: "remove", path: "days/0" }]));
  const r = await runAi(ai, tasksOnly, Trip.parse(trip()));
  assert.ok("error" in r);
  assert.equal(ai.seen.length, 4, "it gives up after a few tries");
  assert.match(JSON.stringify(ai.seen[1]!.messages.at(-1)!.content), /remove days\/0/);
});

// REQ: AI-65 a refusal gives no proposal
test("AI-65 a refusal gives no proposal", async () => {
  const r = await runAi(fake(reply([], { stop: "refusal" })), tasksOnly, Trip.parse(trip()));
  assert.deepEqual("error" in r && r.error, "refusal");
});

// REQ: AI-64 nothing is sent before someone agrees for the trip; the agreement is kept on the trip with who and when
test("AI-64 consent before the first call", async () => {
  const ai = fake(reply([task("k1")]));
  const { app } = await setup(ai);
  const before = await call(app, "/api/trips/berlin/ai/tasks", "a", "POST");
  assert.equal(before.status, 409);
  assert.equal((await before.json()).error, "consent");
  assert.equal(ai.seen.length, 0);
  assert.equal((await call(app, "/api/trips/berlin/ai/consent", "a", "POST")).status, 200);
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.equal(typeof t.aiConsent.at, "string");
  assert.equal(t.aiConsent.by, "user");
  assert.equal((await call(app, "/api/trips/berlin/ai/tasks", "a", "POST")).status, 202);
  assert.equal(ai.seen.length, 1);
});

// REQ: AI-01 AI-65 the result is stored as a pending proposal from the AI and applied only when approved
test("AI-01 AI-65 an AI result is a proposal", async () => {
  const { app } = await setup(fake(reply([task("k1")])));
  await call(app, "/api/trips/berlin/ai/consent", "a", "POST");
  const r = await json(call(app, "/api/trips/berlin/ai/tasks", "a", "POST"));
  assert.equal((await json(call(app, "/api/trips/berlin", "a"))).tasks.length, 0);
  const [p] = await json(call(app, "/api/trips/berlin/proposals", "a"));
  assert.equal(p.id, r.proposalId);
  assert.equal(p.status, "pending");
  assert.equal(p.source.kind, "ai");
  assert.equal(p.source.feature, "tasks");
  assert.equal((await call(app, `/api/trips/berlin/proposals/${p.id}/approve`, "a", "POST")).status, 200);
  assert.deepEqual((await json(call(app, "/api/trips/berlin", "a"))).tasks.map((k: { id: string }) => k.id), ["k1"]);
});

// REQ: AI-65 only those who plan the trip start AI, and only while AI is on for the instance, the area and the trip
test("AI-65 who may start AI and when", async () => {
  const ai = fake(reply([task("k1")]));
  const { app } = await setup(ai);
  await call(app, "/api/trips/berlin/ai/consent", "a", "POST");
  assert.equal((await call(app, "/api/trips/berlin/ai/tasks", await person(app, "olle", "traveler"), "POST")).status, 403);
  assert.equal((await call(app, "/api/trips/berlin/ai/tasks", "r", "POST")).status, 403);
  assert.equal((await call(app, "/api/trips/berlin/ai/kitchen", "a", "POST")).status, 404);
  assert.equal((await call(app, "/api/trips/berlin/ai/tasks", await person(app, "anna", "planner"), "POST")).status, 202);
  const off = await setup(ai, { ai: { enabled: true, areas: { suggestions: false } } });
  await call(off.app, "/api/trips/berlin/ai/consent", "a", "POST");
  assert.equal((await json(call(off.app, "/api/trips/berlin/ai/tasks", "a", "POST"))).error, "off");
  assert.equal(ai.seen.length, 1);
});

// REQ: AI-03 a monthly cap for the instance and one per account; at the cap no call is made and the reason is given
test("AI-03 spending caps", async () => {
  // Each reply costs 10 000 input and 2 000 output tokens: 0.04 + 0.04 = 0.08 USD.
  const ai = fake(reply([task("k1")]));
  const { app, store } = await setup(ai, { ai: { enabled: true, areas: {}, capUsd: 1, capAccountUsd: 0.1 } });
  await call(app, "/api/trips/berlin/ai/consent", "a", "POST");
  const anna = await person(app, "anna", "planner");
  assert.equal((await call(app, "/api/trips/berlin/ai/tasks", anna, "POST")).status, 202);
  assert.equal((await call(app, "/api/trips/berlin/ai/tasks", anna, "POST")).status, 202);
  const capped = await call(app, "/api/trips/berlin/ai/tasks", anna, "POST");
  assert.equal(capped.status, 429);
  assert.deepEqual(await capped.json(), { error: "cap", scope: "account" });
  assert.equal(ai.seen.length, 2);
  assert.equal((await call(app, "/api/trips/berlin/ai/tasks", "a", "POST")).status, 202, "another account still has room");
  assert.equal((await call(app, "/api/trips/berlin/ai/tasks", "a", "POST")).status, 202, "AI-92: the superuser has only the instance's cap");
  const month = new Date().toISOString().slice(0, 7);
  const uses = await store.aiUses(month);
  assert.equal(uses.length, 4);
  assert.ok(Math.abs(uses[0]!.usd - 0.08) < 1e-9);
  await store.saveSettings({ ai: { enabled: true, areas: {}, capUsd: 0.2 } } as never);
  assert.deepEqual(await json(call(app, "/api/trips/berlin/ai/tasks", "a", "POST")), { error: "cap", scope: "instance" });
});

// REQ: AI-03 the cost per person is shown in the usage overview (US-29)
test("AI-03 AI cost in the usage overview", async () => {
  const { app } = await setup(fake(reply([task("k1")], { searches: 2 })));
  await call(app, "/api/trips/berlin/ai/consent", "a", "POST");
  await call(app, "/api/trips/berlin/ai/tasks", "a", "POST");
  const [row] = await json(call(app, "/api/usage", "a"));
  assert.equal(row.ai.length, 1);
  assert.equal(row.ai[0].calls, 1);
  assert.ok(Math.abs(row.ai[0].usd - 0.1) < 1e-9, "tokens 0.08 + two searches 0.02");
});

// REQ: AI-03 the D1 store keeps the AI calls per month
test("AI-03 D1 keeps AI uses per month", async () => {
  const { sqliteD1 } = await import("./helpers/sqlite-d1.ts");
  const { d1Store } = await import("../src/d1-store.ts");
  const store = d1Store(sqliteD1());
  const use = (id: string, month: string) => ({ id, at: `${month}-02T10:00:00.000Z`, month, tripId: "berlin", who: "anna", feature: "tasks", usd: 0.08, result: "proposal" as const });
  await store.saveAiUse(use("u1", "2026-10"));
  await store.saveAiUse(use("u2", "2026-11"));
  assert.deepEqual((await store.aiUses("2026-11")).map((x) => x.id), ["u2"]);
  assert.deepEqual((await store.aiUses()).map((x) => x.id), ["u1", "u2"]);
});

// REQ: AI-65 web search with dynamic filtering runs code, which cannot be combined with disable_parallel_tool_use
test("AI-65 no disable_parallel_tool_use", async () => {
  const ai = fake(reply([task("k1")]));
  await runAi(ai, { ...tasksOnly, web: true }, Trip.parse(trip()));
  assert.equal(JSON.stringify(ai.seen[0]!.tool_choice ?? {}).includes("disable_parallel_tool_use"), false);
});

// REQ: AI-65 several proposal calls in one reply are combined, and on problems each call gets its own answer
test("AI-65 several proposal calls in one reply", async () => {
  const two = (a: unknown[], b: unknown[]) => ({ ...reply(a), content: [
    { type: "tool_use", id: "u1", name: "propose_change", input: { ops: a, reason: "Ett" } },
    { type: "tool_use", id: "u2", name: "propose_change", input: { ops: b, reason: "Två" } }] });
  const ai = fake(two([task("k1")], [{ op: "add", path: "tasks/-", value: { id: "bad", done: false } }]) as never, two([task("k1")], [task("k2", "Ta med EU-kortet")]) as never);
  const r = await runAi(ai, tasksOnly, Trip.parse(trip()));
  assert.ok("ops" in r);
  assert.deepEqual(r.ops.map((o) => (o.value as { id: string }).id), ["k1", "k2"]);
  const back = ai.seen[1]!.messages.at(-1)!.content as { type: string; tool_use_id: string }[];
  assert.deepEqual(back.map((b) => [b.type, b.tool_use_id]), [["tool_result", "u1"], ["tool_result", "u2"]]);
});
