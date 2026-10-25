import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
const trip = {
  id: "berlin", revision: 1, title: "berlin", timezone: "Europe/Berlin", stops: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
  expenses: [{ id: "e0", text: "Fika", category: "Mat/Fritid", amount: 80, paidBy: "bo" }],
};
const expense = (id: string, extra: object = {}) =>
  ({ id, text: "Glass", category: "Mat/Fritid", amount: 60, paidBy: "anna", sharedBy: [], date: "2026-10-25", addedBy: "anna", addedAt: "2026-10-25T12:00:00.000Z", ...extra });

// REQ: AU-10 a link adds one expense at a time, naming who added it, and may not edit or remove expenses or add anything else with it
test("AU-10 a link may add an expense and nothing more", async () => {
  const store = memoryStore([trip]);
  const app = createApp(store, { read: "r", propose: "p", admin: "a" }, { auth });
  const secret = (await (await app.request("/api/trips/berlin/link", { method: "POST", headers: { authorization: "Bearer a" } })).json()).secret;
  const change = (baseRevision: number, ops: unknown[]) => app.request("/api/trips/berlin/changes", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer link.berlin.${secret}` },
    body: JSON.stringify({ baseRevision, ops, reason: "add expense" }),
  });
  assert.equal((await change(1, [{ op: "add", path: "expenses/-", value: expense("e1") }])).status, 200);
  const t = (await store.load("berlin"))!;
  assert.deepEqual([t.revision, t.expenses.map((e) => e.id), t.expenses[1].addedBy], [2, ["e0", "e1"], "anna"]);
  for (const ops of [
    [{ op: "add", path: "expenses/-", value: expense("e2", { addedBy: undefined }) }],
    [{ op: "add", path: "expenses/0", value: expense("e2") }],
    [{ op: "set", path: "expenses/0/amount", value: 1 }],
    [{ op: "remove", path: "expenses/0" }],
    [{ op: "add", path: "expenses/-", value: expense("e2") }, { op: "add", path: "expenses/-", value: expense("e3") }],
    [{ op: "add", path: "expenses/-", value: expense("e2") }, { op: "set", path: "title", value: "Kapad" }],
    [{ op: "set", path: "budgetMax", value: 1 }],
  ]) assert.equal((await change(2, ops)).status, 403, JSON.stringify(ops));
  assert.equal((await store.load("berlin"))!.revision, 2);
});
