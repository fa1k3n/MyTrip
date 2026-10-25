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
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], places: [], packing: [], bookings: [], tasks: [{ id: "k1", text: "Boka", done: false }],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
});
const expense = (id: string) => ({ id, text: "Glass", category: "Mat/Fritid", amount: 60, sharedBy: [], date: "2026-10-25", addedAt: "2026-10-25T12:00:00.000Z" });
const add = (app: App, auth: string, baseRevision: number, id: string) =>
  call(app, "/api/trips/berlin/changes", auth, "POST", { baseRevision, ops: [{ op: "add", path: "expenses/-", value: expense(id) }], reason: "add expense" });

// REQ: PW-08 an expense added offline is recorded even if the trip changed on the server in the meantime
test("PW-08 expenses are added to the latest revision", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const anna = `person.berlin.anna.${(await json(call(app, "/api/trips/berlin/people/anna", "a", "PUT", { role: "traveler" }))).secret}`;
  assert.equal((await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: 1, ops: [{ op: "set", path: "tasks/0/done", value: true }], reason: "x" })).status, 200);
  assert.equal((await add(app, anna, 1, "e1")).status, 200, "based on revision 1, the trip is at 2");
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual([t.revision, t.expenses.map((e: { id: string }) => e.id), t.tasks[0].done], [3, ["e1"], true]);
  const stale = await call(app, "/api/trips/berlin/changes", anna, "POST", { baseRevision: 1, ops: [{ op: "set", path: "tasks/0/done", value: false }], reason: "x" });
  assert.equal(stale.status, 409, "other changes still need the latest revision (MC-05)");
});

// REQ: PW-07 sending the same expense twice records it once: the server recognises it by its id
test("PW-07 an expense sent twice is recorded once", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const anna = `person.berlin.anna.${(await json(call(app, "/api/trips/berlin/people/anna", "a", "PUT", { role: "traveler" }))).secret}`;
  assert.equal((await add(app, anna, 1, "e1")).status, 200);
  const again = await add(app, anna, 1, "e1");
  assert.equal(again.status, 200, "the phone did not hear the first answer and sends it again");
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual([t.expenses.length, t.revision], [1, 2], "not twice, and no new revision");
});
