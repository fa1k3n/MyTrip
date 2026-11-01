import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const person = async (app: App, travelerId: string, role: string) =>
  `person.berlin.${travelerId}.${(await json(call(app, `/api/trips/berlin/people/${travelerId}`, "a", "PUT", { role }))).secret}`;
const trip = () => ({
  id: "berlin", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], bookings: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d0", date: "2026-10-26", title: "Dag", summary: "Dag", icons: ["🎢"], start: "08:00", end: "18:00", activities: [] }],
});
const fika = { id: "fika", text: "Fika", placeIds: [], start: "15:00", durationMin: 45, estimated: true, category: "Mat" };
const propose = async (app: App, revision = 1) =>
  (await json(call(app, "/api/trips/berlin/changes", "p", "POST", { baseRevision: revision, ops: [{ op: "add", path: "days/0/activities/-", value: fika }], reason: "Planera dagen" }))).proposalId as string;

test("MC-19 a Resenär neither sees, approves nor rejects a proposal; a Planerare sees it", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const pid = await propose(app);
  const traveler = await person(app, "anna", "traveler"), planner = await person(app, "bo", "planner");
  assert.equal((await call(app, "/api/trips/berlin/proposals", traveler)).status, 403);
  assert.equal((await call(app, `/api/trips/berlin/proposals/${pid}/approve`, traveler, "POST")).status, 403);
  assert.equal((await call(app, `/api/trips/berlin/proposals/${pid}/reject`, traveler, "POST")).status, 403);
  assert.deepEqual((await json(call(app, "/api/trips/berlin/proposals", planner))).map((p: { id: string }) => p.id), [pid]);
});

test("MC-18 Godkänn applies a proposal, and a proposal for an older revision is refused", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const planner = await person(app, "bo", "planner");
  const pid = await propose(app);
  const old = await propose(app);
  const ok = await call(app, `/api/trips/berlin/proposals/${pid}/approve`, planner, "POST");
  assert.equal(ok.status, 200);
  assert.deepEqual((await json(call(app, "/api/trips/berlin", "a"))).days[0].activities.map((a: { id: string }) => a.id), ["fika"]);
  assert.equal((await call(app, `/api/trips/berlin/proposals/${old}/approve`, planner, "POST")).status, 409, "made for revision 1");
  assert.equal((await call(app, `/api/trips/berlin/proposals/${old}/reject`, planner, "POST")).status, 200, "Avvisa still works");
});

test("MC-20 the server rejects a proposal that disturbs a pinned activity, naming it", async () => {
  const pinned = { ...trip(), days: [{ ...trip().days[0], activities: [{ ...fika, estimated: false, pinned: true }] }] };
  const app = createApp(memoryStore([pinned]), tokens);
  const r = await call(app, "/api/trips/berlin/changes", "p", "POST", { baseRevision: 1, ops: [{ op: "set", path: "days/0/activities/0/start", value: "16:00" }], reason: "Senare fika" });
  assert.equal(r.status, 422);
  assert.deepEqual((await r.json()).problems, ["Rubbar en nål: Fika"]);
  const fine = await call(app, "/api/trips/berlin/changes", "p", "POST", { baseRevision: 1, ops: [{ op: "set", path: "days/0/activities/0/note", value: "Kanelbulle" }], reason: "Notis" });
  assert.equal(fine.status, 202, "other changes to it are fine");
  const admin = await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: 1, ops: [{ op: "set", path: "days/0/activities/0/pinned", value: false }] });
  assert.equal(admin.status, 200, "the admin unpins in the app");
});
