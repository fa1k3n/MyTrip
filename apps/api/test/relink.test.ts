import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const act = (id: string, category: string) => ({ id, text: id, placeIds: [], category });
const trip = () => ({
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], places: [], packing: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [act("museum", "Museum"), act("glass", "Mat")] }],
  expenses: [
    { id: "bos", text: "Glass", category: "Upplevelse", amount: 45, paidBy: "bo", sharedBy: [], date: "2026-10-25", activityId: "museum", addedBy: "bo" },
    { id: "annas", text: "Entré", category: "Upplevelse", amount: 300, paidBy: "anna", sharedBy: [], date: "2026-10-25", activityId: "museum", addedBy: "anna" },
  ],
});
const person = async (app: App, id: string, role: string) => `person.berlin.${id}.${(await json(call(app, `/api/trips/berlin/people/${id}`, "a", "PUT", { role }))).secret}`;
const change = async (app: App, auth: string, ops: unknown[]) =>
  call(app, "/api/trips/berlin/changes", auth, "POST", { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops, reason: "test" });

// REQ: MI-41 a traveler changes the wish, activity and category of their own expenses only; a Planerare every expense
test("MI-41 who may change an expense's wish", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "planner");
  assert.equal((await change(app, bo, [{ op: "set", path: "expenses/0/activityId", value: "glass" }, { op: "set", path: "expenses/0/category", value: "Mat" }])).status, 200);
  assert.equal((await change(app, bo, [{ op: "remove", path: "expenses/0/activityId" }])).status, 200, "or to none");
  assert.equal((await change(app, bo, [{ op: "set", path: "expenses/0/dreamId", value: "w" }])).status, 200, "its wish");
  assert.equal((await change(app, bo, [{ op: "remove", path: "expenses/0/dreamId" }])).status, 200, "or none");
  assert.equal((await change(app, bo, [{ op: "set", path: "expenses/1/dreamId", value: "w" }])).status, 403, "not someone else's wish");
  assert.equal((await change(app, bo, [{ op: "set", path: "expenses/1/activityId", value: "glass" }])).status, 403, "not someone else's");
  assert.equal((await change(app, bo, [{ op: "set", path: "expenses/0/amount", value: 1 }])).status, 403, "only the activity and category");
  assert.equal((await change(app, bo, [{ op: "set", path: "expenses/0/activityId", value: "glass" }, { op: "set", path: "expenses/0/amount", value: 1 }])).status, 403);
  assert.equal((await change(app, anna, [{ op: "set", path: "expenses/1/activityId", value: "glass" }])).status, 200, "a Planerare changes every expense");
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual(t.expenses.map((e: { activityId?: string; category: string; amount: number }) => [e.activityId, e.category, e.amount]),
    [[undefined, "Mat", 45], ["glass", "Upplevelse", 300]]);
});
