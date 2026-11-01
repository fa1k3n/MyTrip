import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const ex = (id: string, addedBy: string) => ({ id, text: id, category: "Mat", amount: 45, paidBy: addedBy, sharedBy: [], date: "2026-10-25", addedBy });
const trip = () => ({
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], places: [], packing: [], bookings: [], tasks: [], days: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  expenses: [ex("bos", "bo"), ex("annas", "anna")],
});
const person = async (app: App, id: string, role: string) => `person.berlin.${id}.${(await json(call(app, `/api/trips/berlin/people/${id}`, "a", "PUT", { role }))).secret}`;
const change = async (app: App, auth: string, ops: unknown[]) =>
  call(app, "/api/trips/berlin/changes", auth, "POST", { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops, reason: "test" });
const ids = async (app: App) => (await json(call(app, "/api/trips/berlin", "a"))).expenses.map((e: { id: string }) => e.id);

// REQ: MI-34 a Planerare and the superuser remove every expense; a traveler none, not even their own (AU-13)
test("MI-34 who may remove an expense", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "remove", path: "expenses/0" }])).status, 403, "a traveler, not even their own");
  assert.equal((await change(app, anna, [{ op: "remove", path: "expenses/0" }])).status, 200, "a Planerare, also someone else's");
  assert.equal((await change(app, "a", [{ op: "remove", path: "expenses/0" }])).status, 200, "the superuser");
  assert.deepEqual(await ids(app), []);
});

// REQ: MI-35 those who may register payments remove them; a traveler below Ändra on expenses may not
test("MI-35 who may remove a payment", async () => {
  const app = createApp(memoryStore([{ ...trip(), payments: [{ id: "p1", from: "bo", to: "anna", amount: 100 }] }]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "remove", path: "payments/0" }])).status, 403);
  assert.equal((await change(app, anna, [{ op: "remove", path: "payments/0" }])).status, 200);
  assert.deepEqual((await json(call(app, "/api/trips/berlin", "a"))).payments, []);
});

// REQ: MI-38 a Planerare and the superuser set who shares costs; a traveler may not
test("MI-38 who may change who shares costs", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "set", path: "travelers/1/shares", value: false }])).status, 403);
  assert.equal((await change(app, anna, [{ op: "set", path: "travelers/1/shares", value: false }])).status, 200);
  assert.equal((await json(call(app, "/api/trips/berlin", "a"))).travelers[1].shares, false);
});
