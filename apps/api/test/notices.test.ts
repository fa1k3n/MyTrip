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
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }, { id: "cy", name: "Cy", packing: [] }],
  days: [{ id: "d1", date: "2026-10-24", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
});
const person = async (app: App, id: string, role: string) => `person.berlin.${id}.${(await json(call(app, `/api/trips/berlin/people/${id}`, "a", "PUT", { role }))).secret}`;
const change = async (app: App, auth: string, ops: unknown[]) =>
  call(app, "/api/trips/berlin/changes", auth, "POST", { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops, reason: "test" });
const sub = (name: string) => ({ endpoint: `https://push.example.com/${name}`, keys: { p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", auth: "8eDyX_uCN0XRhSbY5hs7Hg" } });

async function setup(vapid = true) {
  const sent: string[] = [];
  let status = 201;
  const fetch = (async (url: string) => { sent.push(url); return new Response(null, { status }); }) as never;
  const key = vapid ? JSON.stringify(await crypto.subtle.exportKey("jwk", (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])).privateKey)) : undefined;
  const store = memoryStore([trip()]);
  const app = createApp(store, tokens, { vapidKey: key, fetch });
  const anna = await person(app, "anna", "traveler"), bo = await person(app, "bo", "planner"), cy = await person(app, "cy", "traveler");
  return { app, store, anna, bo, cy, sent, setStatus: (s: number) => { status = s; } };
}
const settle = () => new Promise((ok) => setTimeout(ok, 50)); // notices go out after the answer

// REQ: NT-03 each person turns notices on and off for the trip on their own phone
test("NT-03 subscribing and unsubscribing", async () => {
  const { app, store, anna } = await setup();
  assert.ok((await json(call(app, "/api/push/key", anna))).key.length > 80, "the public key, to subscribe with");
  assert.equal((await call(app, "/api/trips/berlin/push", anna, "PUT", sub("anna"))).status, 204);
  assert.equal((await call(app, "/api/trips/berlin/push", anna, "PUT", { endpoint: "http://insecure.example.com/x", keys: sub("x").keys })).status, 400);
  assert.deepEqual((await store.pushSubs("berlin")).map((s) => [s.who, s.endpoint]), [["anna", "https://push.example.com/anna"]]);
  assert.equal((await call(app, "/api/trips/berlin/push", "r", "PUT", sub("r"))).status, 403, "a read token is no person");
  assert.equal((await call(app, "/api/trips/berlin/push", anna, "DELETE", { endpoint: sub("anna").endpoint })).status, 204);
  assert.deepEqual(await store.pushSubs("berlin"), []);
});

// REQ: NT-01 a change gives a notice to the others with notices on, not to the one who made it
test("NT-01 notices go to the others", async () => {
  const { app, anna, bo, cy, sent } = await setup();
  for (const [auth, name] of [[anna, "anna"], [bo, "bo"], [cy, "cy"]]) await call(app, "/api/trips/berlin/push", auth, "PUT", sub(name));
  await change(app, anna, [{ op: "add", path: "expenses/-", value: { id: "e1", text: "Glass", category: "Mat/Fritid", amount: 60, sharedBy: [] } }]);
  await settle();
  assert.deepEqual(sent.sort(), ["https://push.example.com/bo", "https://push.example.com/cy"]);
  sent.length = 0;
  await change(app, bo, [{ op: "set", path: "tasks", value: [{ id: "k1", text: "Boka", done: false }] }]);
  await change(app, bo, [{ op: "set", path: "tasks/0/done", value: true }]);
  await settle();
  assert.deepEqual(sent.sort(), ["https://push.example.com/anna", "https://push.example.com/cy"], "adding a task, but not ticking it");
});

// REQ: NT-02 a change the receiver cannot see gives them no notice
test("NT-02 hidden changes give no notice", async () => {
  const { app, anna, bo, cy, sent } = await setup();
  for (const [auth, name] of [[anna, "anna"], [cy, "cy"]]) await call(app, "/api/trips/berlin/push", auth, "PUT", sub(name));
  await change(app, bo, [{ op: "add", path: "days/0/activities/-", value: { id: "a1", text: "Liseberg", placeIds: [], start: "10:00", hiddenFrom: ["anna"] } }]);
  await settle();
  assert.deepEqual(sent, ["https://push.example.com/cy"], "Anna does not hear of the surprise");
});

// REQ: NT-05 without a key notices are off; a subscription the push service no longer accepts, or of a removed link, is removed
test("NT-05 keys and stale subscriptions", async () => {
  const off = await setup(false);
  assert.equal((await call(off.app, "/api/push/key", off.anna)).status, 404);
  const { app, store, anna, bo, cy, sent, setStatus } = await setup();
  await call(app, "/api/trips/berlin/push", anna, "PUT", sub("anna"));
  await call(app, "/api/trips/berlin/push", cy, "PUT", sub("cy"));
  setStatus(410);
  await change(app, bo, [{ op: "add", path: "days/0/activities/-", value: { id: "a1", text: "Zoo", placeIds: [], start: "10:00" } }]);
  await settle();
  assert.equal(sent.length, 2);
  assert.deepEqual(await store.pushSubs("berlin"), [], "gone at the push service");
  setStatus(201);
  await call(app, "/api/trips/berlin/push", anna, "PUT", sub("anna"));
  await call(app, "/api/trips/berlin/people/anna", "a", "DELETE");
  assert.deepEqual(await store.pushSubs("berlin"), [], "the link was removed");
});
