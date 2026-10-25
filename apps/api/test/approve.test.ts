import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const trip = () => ({
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], places: [], packing: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
  expenses: [{ id: "old", text: "Bensin", category: "Transport", amount: 500, paidBy: "anna", sharedBy: [] }],
});
const expense = (id: string, extra: object = {}) => ({ id, text: "Glass", category: "Mat/Fritid", amount: 60, sharedBy: [], ...extra });
const person = async (app: App, id: string, role: string) => `person.berlin.${id}.${(await json(call(app, `/api/trips/berlin/people/${id}`, "a", "PUT", { role }))).secret}`;
const change = async (app: App, auth: string, ops: unknown[]) =>
  call(app, "/api/trips/berlin/changes", auth, "POST", { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops, reason: "test" });

// REQ: MI-09 an expense a Resenär adds is stored as unhandled; a Planerare's and the superuser's are approved at once
test("MI-09 expenses from a Resenär are unhandled", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "add", path: "expenses/-", value: expense("e1") }])).status, 200);
  assert.equal((await change(app, bo, [{ op: "add", path: "expenses/-", value: expense("e2", { pending: false }) }])).status, 200, "it cannot opt out");
  assert.equal((await change(app, anna, [{ op: "add", path: "expenses/-", value: expense("e3") }])).status, 200);
  assert.equal((await change(app, "a", [{ op: "add", path: "expenses/-", value: expense("e4", { paidBy: "anna" }) }])).status, 200);
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual(t.expenses.map((e: { id: string; pending?: boolean }) => [e.id, e.pending]), [["old", undefined], ["e1", true], ["e2", true], ["e3", undefined], ["e4", undefined]]);
});

// REQ: MI-12 only a Planerare and the superuser approve; a Resenär's approval is rejected
test("MI-12 approving needs a Planerare or the superuser", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const t0 = trip();
  // A Resenär who may change expenses still cannot approve.
  await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: 1, ops: [{ op: "set", path: "access", value: { traveler: { mi: { parts: { expenses: "write" } } } } }], reason: "x" });
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "add", path: "expenses/-", value: expense("e1") }])).status, 200);
  assert.equal((await change(app, bo, [{ op: "remove", path: "expenses/1/pending" }])).status, 403);
  assert.equal((await change(app, bo, [{ op: "set", path: "expenses/1", value: { ...expense("e1"), paidBy: "bo" } }])).status, 403, "replacing it without the mark");
  assert.equal((await change(app, anna, [{ op: "remove", path: "expenses/1/pending" }])).status, 200);
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual([t.expenses[1].id, t.expenses[1].pending, t0.expenses.length], ["e1", undefined, 1]);
});
