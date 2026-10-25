import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const trip = (id: string) => ({
  id, revision: 1, title: id, timezone: "Europe/Berlin", stops: [], places: [], packing: ["Laddare"],
  travelers: [{ id: "anna", name: "Anna", packing: ["Pass"] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
  tasks: [{ id: "k1", text: "Boka", done: false }],
  bookings: [{ id: "hotel", name: "Hotel", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "XY-1" }],
});
const setup = () => {
  const store = memoryStore([trip("berlin"), trip("skane")]);
  return { store, app: createApp(store, tokens) };
};
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
/** Creates (or changes the permission of) a traveler's personal link and returns its bearer token. */
const person = async (app: App, travelerId: string, role: string, auth = "a", tripId = "berlin") => {
  const r = await json(call(app, `/api/trips/${tripId}/people/${travelerId}`, auth, "PUT", { role }));
  return `person.${tripId}.${travelerId}.${r.secret}`;
};
const change = (app: App, auth: string, baseRevision: number, ops: unknown[], tripId = "berlin") =>
  call(app, `/api/trips/${tripId}/changes`, auth, "POST", { baseRevision, ops, reason: "test" });
const expense = (extra: object = {}) => ({ id: "e1", text: "Glass", category: "Mat/Fritid", amount: 60, sharedBy: [], date: "2026-10-25", addedAt: "2026-10-25T12:00:00.000Z", ...extra });

// REQ: AU-11 a personal link per traveler with a permission; changing the permission keeps it, replacing or removing stops the old one, also when the traveler goes
test("AU-11 personal links are created, changed, replaced and removed", async () => {
  const { app } = setup();
  const anna = await person(app, "anna", "traveler");
  assert.ok(anna.split(".")[3].length >= 22, "at least 128 random bits");
  assert.deepEqual(await json(call(app, "/api/me", anna)), { role: "traveler", tripId: "berlin", travelerId: "anna" });
  assert.equal(await person(app, "anna", "planner"), anna); // a new permission keeps the link
  assert.deepEqual(await json(call(app, "/api/me", anna)), { role: "planner", tripId: "berlin", travelerId: "anna" });
  const list = await json(call(app, "/api/trips/berlin/people", "a"));
  assert.deepEqual(list, [{ travelerId: "anna", role: "planner", secret: anna.split(".")[3] }]);
  const renewed = await json(call(app, "/api/trips/berlin/people/anna/renew", "a", "POST"));
  assert.equal((await call(app, "/api/me", anna)).status, 401);
  const anna2 = `person.berlin.anna.${renewed.secret}`;
  assert.equal((await call(app, "/api/me", anna2)).status, 200);
  assert.equal((await call(app, "/api/trips/berlin/people/anna", "a", "DELETE")).status, 204);
  assert.equal((await call(app, "/api/me", anna2)).status, 401);
  assert.equal((await call(app, "/api/trips/berlin/people/okand", "a", "PUT", { role: "traveler" })).status, 404);
  assert.equal((await call(app, "/api/trips/berlin/people/bo", "a", "PUT", { role: "admin" })).status, 400);
  const bo = await person(app, "bo", "traveler");
  assert.equal((await change(app, "a", 1, [{ op: "remove", path: "travelers/1" }])).status, 200);
  assert.equal((await call(app, "/api/me", bo)).status, 401, "a removed traveler's link stops working");
  assert.equal((await call(app, "/api/me", "person.berlin.anna.fel")).status, 401);
});

// REQ: AU-12 a Resenär link sees its trip with booking references, may tick and nothing else besides own expenses
test("AU-12 a Resenär link reads its trip and ticks", async () => {
  const { app, store } = setup();
  const anna = await person(app, "anna", "traveler");
  const trips = await json(call(app, "/api/trips", anna));
  assert.deepEqual(trips.map((t: { id: string }) => t.id), ["berlin"]);
  assert.equal(trips[0].bookings[0].reference, "XY-1");
  assert.equal((await call(app, "/api/trips/skane", anna)).status, 404);
  assert.equal((await change(app, anna, 1, [{ op: "set", path: "tasks/0/done", value: true }])).status, 200);
  assert.equal((await change(app, anna, 2, [{ op: "set", path: "packed", value: ["Laddare"] }, { op: "set", path: "travelers/0/packed", value: ["Pass"] }])).status, 200);
  for (const ops of [
    [{ op: "set", path: "title", value: "Kapad" }],
    [{ op: "add", path: "packing/-", value: "Mer" }],
    [{ op: "set", path: "tasks/0/done", value: false }, { op: "remove", path: "bookings/0" }],
  ]) assert.equal((await change(app, anna, 3, ops)).status, 403, JSON.stringify(ops));
  for (const [path, method] of [["/api/settings", "GET"], ["/api/trips/berlin/people", "GET"], ["/api/trips/berlin/link", "POST"], ["/api/trips/berlin/proposals", "GET"], ["/api/log", "GET"]])
    assert.equal((await call(app, path, anna, method)).status, 403, path);
  assert.equal((await store.load("berlin"))!.revision, 3);
});

// REQ: AU-13 an expense from a personal link is paid and added by its traveler; naming another traveler is rejected
test("AU-13 expenses from a personal link carry the link's traveler", async () => {
  const { app, store } = setup();
  const anna = await person(app, "anna", "traveler");
  assert.equal((await change(app, anna, 1, [{ op: "add", path: "expenses/-", value: expense() }])).status, 200);
  const e = (await store.load("berlin"))!.expenses[0];
  assert.deepEqual([e.paidBy, e.addedBy], ["anna", "anna"]);
  for (const ops of [
    [{ op: "add", path: "expenses/-", value: expense({ id: "e2", paidBy: "bo" }) }],
    [{ op: "add", path: "expenses/-", value: expense({ id: "e2", addedBy: "bo" }) }],
    [{ op: "add", path: "expenses/-", value: expense({ id: "e2" }) }, { op: "add", path: "expenses/-", value: expense({ id: "e3" }) }],
    [{ op: "add", path: "expenses/-", value: expense({ id: "e2" }) }, { op: "set", path: "tasks/0/done", value: true }],
    [{ op: "set", path: "expenses/0/amount", value: 1 }],
    [{ op: "remove", path: "expenses/0" }],
  ]) assert.equal((await change(app, anna, 2, ops)).status, 403, JSON.stringify(ops));
  const planner = await person(app, "bo", "planner");
  assert.equal((await change(app, planner, 2, [{ op: "add", path: "expenses/-", value: expense({ id: "e4" }) }])).status, 200);
  assert.deepEqual((await store.load("berlin"))!.expenses.map((x) => [x.id, x.paidBy, x.addedBy]), [["e1", "anna", "anna"], ["e4", "bo", "bo"]]);
  assert.equal((await change(app, planner, 3, [{ op: "add", path: "expenses/-", value: expense({ id: "e5", paidBy: "anna" }) }])).status, 403);
});

// REQ: AU-14 a Planerare link does everything for its trip, but not app settings, other trips, the log, or creating and deleting trips
test("AU-14 a Planerare link manages its trip only", async () => {
  const { app, store } = setup();
  const anna = await person(app, "anna", "planner");
  assert.equal((await change(app, anna, 1, [{ op: "set", path: "title", value: "Höstlov" }])).status, 200);
  assert.equal((await store.load("berlin"))!.title, "Höstlov");
  assert.equal((await call(app, "/api/trips/berlin/link", anna, "POST")).status, 201);
  assert.equal((await call(app, "/api/trips/berlin/people/bo", anna, "PUT", { role: "traveler" })).status, 201);
  assert.equal((await call(app, "/api/trips/berlin/people", anna)).status, 200);
  const p = await json(change(app, "p", 2, [{ op: "set", path: "purpose", value: "Lugnt." }]));
  assert.equal((await call(app, `/api/trips/berlin/proposals/${p.proposalId}/approve`, anna, "POST")).status, 200);
  assert.equal((await store.load("berlin"))!.purpose, "Lugnt.");
  assert.equal((await call(app, "/api/trips/skane", anna)).status, 404);
  assert.equal((await change(app, anna, 1, [{ op: "set", path: "title", value: "X" }], "skane")).status, 404);
  for (const [path, method, body] of [["/api/settings", "GET"], ["/api/settings", "PUT", {}], ["/api/log", "GET"], ["/api/trips", "POST", { title: "Ny" }], ["/api/trips/berlin", "DELETE"]] as const)
    assert.equal((await call(app, path, anna, method, body)).status, 403, `${method} ${path}`);
  assert.ok(await store.load("berlin"));
});

// REQ: AU-15 changes from a personal link are logged with the traveler's name
test("AU-15 the log names the traveler", async () => {
  const { app } = setup();
  const bo = await person(app, "bo", "traveler");
  await change(app, bo, 1, [{ op: "set", path: "tasks/0/done", value: true }]);
  const log = await json(call(app, "/api/log", "a"));
  assert.equal(log.at(-1).actor, "Bo");
});

// REQ: AU-18 an activity hidden from chosen travelers reaches them and every Följare without title, note, places or category; others see it
test("AU-18 hidden activities are masked for the chosen travelers and followers", async () => {
  const t = trip("berlin");
  const store = memoryStore([{
    ...t, places: [{ id: "spa", name: "Hemligt spa", address: "Gatan 1" }, { id: "zoo", name: "Zoo", address: "Gatan 2" }],
    days: [{ ...t.days[0], activities: [
      { id: "a1", text: "Överraskning: spa", note: "Boka bord", placeIds: ["spa"], start: "15:00", durationMin: 120, category: "Mat/Fritid", hiddenFrom: ["anna"] },
      { id: "a2", text: "Zoo", placeIds: ["zoo"], start: "10:00" },
    ] }],
  }]);
  const app = createApp(store, tokens);
  const secret = (await json(call(app, "/api/trips/berlin/link", "a", "POST"))).secret;
  for (const auth of [await person(app, "anna", "traveler"), `link.berlin.${secret}`]) {
    const got = await json(call(app, "/api/trips/berlin", auth));
    assert.deepEqual(got.days[0].activities, [
      { id: "a1", text: "", placeIds: [], start: "15:00", estimated: false, durationMin: 120, hidden: true },
      { id: "a2", text: "Zoo", placeIds: ["zoo"], start: "10:00", estimated: false },
    ], auth);
    assert.deepEqual(got.places.map((p: { id: string }) => p.id), ["zoo"], auth);
  }
  for (const role of ["traveler", "planner"]) { // Bo is not among those it is hidden from; a Planerare sees everything
    const got = await json(call(app, "/api/trips/berlin", await person(app, "bo", role)));
    assert.deepEqual([got.days[0].activities[0].text, got.days[0].activities[0].hiddenFrom, got.places.length], ["Överraskning: spa", ["anna"], 2], role);
  }
});

// REQ: AU-18 a Planerare cannot hide an activity from themselves
test("AU-18 no one hides an activity from themselves", async () => {
  const { app, store } = setup();
  const bo = await person(app, "bo", "planner");
  const act = (hiddenFrom: string[]) => [{ op: "set", path: "days/0/activities", value: [{ id: "a1", text: "Spa", placeIds: [], start: "15:00", hiddenFrom }] }];
  assert.equal((await change(app, bo, 1, act(["bo"]))).status, 403);
  assert.equal((await change(app, bo, 1, act(["anna", "bo"]))).status, 403);
  assert.equal((await change(app, bo, 1, act(["anna"]))).status, 200);
  assert.deepEqual((await store.load("berlin"))!.days[0].activities[0].hiddenFrom, ["anna"]);
});

// REQ: AU-21 the server sends and accepts what the trip's permissions say, not the fixed defaults
test("AU-21 the server follows the trip's permissions", async () => {
  const { app, store } = setup();
  const access = {
    follower: { nala: { visible: true, parts: { tasks: "check", budget: "read" } } },
    traveler: { nala: { parts: { bookings: "hidden", packing: "read" } }, up: { parts: { bookings: "hidden" } } },
    planner: { nala: { parts: { budget: "read" } } },
  };
  assert.equal((await change(app, "a", 1, [{ op: "set", path: "access", value: access }])).status, 200);
  const follow = `link.berlin.${(await json(call(app, "/api/trips/berlin/link", "a", "POST"))).secret}`;
  const f = await json(call(app, "/api/trips/berlin", follow));
  assert.deepEqual([f.tasks.length, Array.isArray(f.budget), f.bookings, f.info], [1, true, [], []]);
  assert.equal((await change(app, follow, 2, [{ op: "set", path: "tasks/0/done", value: true }])).status, 200);
  const anna = await person(app, "anna", "traveler");
  const a = await json(call(app, "/api/trips/berlin", anna));
  assert.deepEqual([a.bookings, a.travelers[0].packing], [[], ["Pass"]]);
  assert.equal((await change(app, anna, 3, [{ op: "set", path: "packed", value: ["Laddare"] }])).status, 403, "packing is read only");
  const bo = await person(app, "bo", "planner");
  assert.equal((await change(app, bo, 3, [{ op: "add", path: "budget/-", value: { id: "b9", category: "Övrigt", paid: false } }])).status, 403, "budget is read only");
  assert.equal((await change(app, bo, 3, [{ op: "set", path: "title", value: "Nytt" }])).status, 200, "the trip's own settings stay with the planner");
  assert.equal((await store.load("berlin"))!.revision, 4);
});

// REQ: AU-22 only the superuser changes permissions; booking references never reach a Följare
test("AU-22 permissions belong to the superuser", async () => {
  const { app } = setup();
  const bo = await person(app, "bo", "planner");
  assert.equal((await change(app, bo, 1, [{ op: "set", path: "access", value: { planner: { nala: { parts: { budget: "read" } } } } }])).status, 403);
  assert.equal((await change(app, "a", 1, [{ op: "set", path: "access", value: { follower: { up: { parts: { bookings: "read" } } } } }])).status, 200);
  const follow = `link.berlin.${(await json(call(app, "/api/trips/berlin/link", "a", "POST"))).secret}`;
  const f = await json(call(app, "/api/trips/berlin", follow));
  assert.deepEqual([f.bookings.length, f.bookings[0].reference], [1, undefined]);
  assert.deepEqual(Object.keys(f.access), ["follower"], "a link gets only its own role's rules");
  assert.equal(f.access.follower.up.parts.bookings, "read");
});

// REQ: AU-24 an activity similar to a hidden one on the same day is masked for the same travelers; the Planerare sees it marked
test("AU-24 similar activities on the same day are hidden too", async () => {
  const t = trip("berlin");
  const store = memoryStore([{
    ...t, places: [{ id: "lb", name: "Liseberg", address: "Gatan 3" }],
    days: [{ ...t.days[0], activities: [
      { id: "a1", text: "Bil till Liseberg", placeIds: [], start: "09:00", durationMin: 60 },
      { id: "a2", text: "Liseberg", placeIds: ["lb"], start: "10:00", hiddenFrom: ["anna"] },
      { id: "a3", text: "Bil hem", placeIds: [], start: "18:00" },
    ] }],
  }]);
  const app = createApp(store, tokens);
  const secret = (await json(call(app, "/api/trips/berlin/link", "a", "POST"))).secret;
  for (const auth of [await person(app, "anna", "traveler"), `link.berlin.${secret}`]) {
    const got = await json(call(app, "/api/trips/berlin", auth));
    assert.deepEqual(got.days[0].activities.map((a: { text: string; hidden?: boolean }) => [a.text, !!a.hidden]),
      [["", true], ["", true], ["Bil hem", false]], auth);
  }
  const bo = await json(call(app, "/api/trips/berlin", await person(app, "bo", "traveler")));
  assert.equal(bo.days[0].activities[0].text, "Bil till Liseberg");
  const planner = await json(call(app, "/api/trips/berlin", await person(app, "bo", "planner")));
  assert.deepEqual(planner.days[0].activities[0].hiddenFrom, undefined, "the stored data is not changed");
});
