import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const mem = (dreamId: string, by: string, extra: object = {}) => ({ id: `m-${dreamId}-${by}`, dreamId, by, verdict: "again", ...extra });
const trip = () => ({
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], places: [], packing: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [
    { id: "zoo", text: "Zoo", placeIds: [], dreamId: "w-zoo" }, { id: "tarta", text: "Tårta", placeIds: [], hiddenFrom: ["bo"], dreamId: "w-tarta" }] }],
  dreams: [{ id: "w-zoo", title: "Zoo", category: "Aktivitet", source: "", icon: "star", votes: 1 }, { id: "w-tarta", title: "Tårta", category: "Mat", source: "", icon: "star", votes: 1 }],
  album: "https://photos.example.org/album/x",
  memories: [mem("w-zoo", "anna", { note: "Lejonen sov." }), mem("w-tarta", "anna", { note: "Tårtan var god." })],
  expenses: [{ id: "e1", text: "Mat", category: "Mat/Fritid", amount: 300, paidBy: "anna", sharedBy: [] }],
});
const link = async (app: App) => `link.berlin.${(await json(call(app, "/api/trips/berlin/link", "a", "POST"))).secret}`;
const person = async (app: App, id: string, role: string) => `person.berlin.${id}.${(await json(call(app, `/api/trips/berlin/people/${id}`, "a", "PUT", { role }))).secret}`;
const change = async (app: App, auth: string, ops: unknown[]) =>
  call(app, "/api/trips/berlin/changes", auth, "POST", { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops, reason: "test" });

// REQ: MI-21 memories and the album reach persons, not a Följare, and not the memories of a wish hidden from the viewer
// REQ: MI-18 a Resenär gets the verdicts of others but not their comments; a Planerare gets every comment
test("MI-21 MI-18 who gets memories, comments and the album", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  const a = await json(call(app, "/api/trips/berlin", anna));
  assert.deepEqual([a.album, a.memories.map((m: { note?: string }) => m.note)], ["https://photos.example.org/album/x", ["Lejonen sov.", "Tårtan var god."]]);
  assert.equal((await change(app, bo, [{ op: "add", path: "memories/-", value: mem("w-zoo", "bo", { note: "Bra." }) }])).status, 200);
  const b = await json(call(app, "/api/trips/berlin", bo));
  assert.equal(b.album, "https://photos.example.org/album/x");
  assert.deepEqual(b.memories.map((m: { verdict?: string; note?: string }) => [m.verdict, m.note]), [["again", undefined], [undefined, undefined], ["again", "Bra."]],
    "others' comments removed, the hidden wish's memory blanked, the own comment kept");
  const f = await json(call(app, "/api/trips/berlin", await link(app)));
  assert.deepEqual([f.album, f.memories], [undefined, []]);
  await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops: [{ op: "set", path: "access", value: { planner: { mi: { parts: { memories: "hidden" } } } } }], reason: "x" });
  const hid = await json(call(app, "/api/trips/berlin", anna));
  assert.deepEqual([hid.album, hid.memories], [undefined, []]);
});

// REQ: MI-22 a personal link changes only its own traveler's memories, and only with Ändra on Minnen
test("MI-22 only one's own memories", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "add", path: "memories/-", value: mem("w-zoo", "bo") }])).status, 200);
  assert.equal((await change(app, bo, [{ op: "add", path: "memories/-", value: mem("w-zoo", "anna", { id: "m-x" }) }])).status, 403, "not in another's name");
  assert.equal((await change(app, bo, [{ op: "set", path: "memories/0/note", value: "Tråkigt." }])).status, 403, "not another's sentence");
  assert.equal((await change(app, bo, [{ op: "remove", path: "memories/0" }])).status, 403, "not another's memory");
  assert.equal((await change(app, anna, [{ op: "remove", path: "memories/2" }])).status, 403, "a Planerare neither");
  assert.equal((await change(app, bo, [{ op: "set", path: "memories/2/note", value: "Roligt!" }])).status, 200);
  assert.equal((await change(app, "a", [{ op: "add", path: "memories/-", value: mem("w-zoo", "bo", { id: "m-y" }) }])).status, 422, "the superuser too keeps one per traveler");
  await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops: [{ op: "set", path: "access", value: { traveler: { mi: { parts: { memories: "read" } } } } }], reason: "x" });
  assert.equal((await change(app, bo, [{ op: "set", path: "memories/2/verdict", value: "never" }])).status, 403, "Läsa is not enough");
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual(t.memories.map((m: { by: string; note?: string }) => [m.by, m.note]), [["anna", "Lejonen sov."], ["anna", "Tårtan var god."], ["bo", "Roligt!"]]);
});

// REQ: MI-20 the album link is set by a Planerare or the superuser in the settings
test("MI-20 who sets the album link", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "set", path: "album", value: "https://photos.example.org/b" }])).status, 403);
  assert.equal((await change(app, anna, [{ op: "set", path: "album", value: "http://photos.example.org/b" }])).status, 422);
  assert.equal((await change(app, anna, [{ op: "set", path: "album", value: "https://photos.example.org/b" }])).status, 200);
  assert.equal((await change(app, anna, [{ op: "remove", path: "album" }])).status, 200);
  assert.equal((await json(call(app, "/api/trips/berlin", "a"))).album, undefined);
});

// REQ: MI-25 a Resenär cannot change who shares an expense; a Planerare can
test("MI-25 splitting needs Ändra on expenses", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "set", path: "expenses/0/sharedBy", value: ["anna"] }])).status, 403);
  assert.equal((await change(app, anna, [{ op: "set", path: "expenses/0/sharedBy", value: ["anna"] }])).status, 200);
  assert.deepEqual((await json(call(app, "/api/trips/berlin", "a"))).expenses[0].sharedBy, ["anna"]);
});

// REQ: MI-26 an agent with a read-only key gets the memories as data: wish, verdict and comment, with the wish's category and source
test("MI-26 memories are data for later trips", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const t = await json(call(app, "/api/trips/berlin", "r"));
  assert.deepEqual(t.memories.map((m: { dreamId: string; verdict?: string; note?: string }) => [m.dreamId, m.verdict, m.note]),
    [["w-zoo", "again", "Lejonen sov."], ["w-tarta", "again", "Tårtan var god."]]);
  const wish = t.dreams.find((w: { id: string }) => w.id === t.memories[0].dreamId);
  assert.deepEqual([wish.title, wish.category], ["Zoo", "Aktivitet"]);
});
