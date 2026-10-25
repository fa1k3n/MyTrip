import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const person = async (app: App, travelerId: string, role: string) =>
  `person.berlin.${travelerId}.${(await json(call(app, `/api/trips/berlin/people/${travelerId}`, "a", "PUT", { role }))).secret}`;
const change = async (app: App, auth: string, ops: unknown[]) => call(app, "/api/trips/berlin/changes", auth, "POST",
  { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops, reason: "test" });

/** Liseberg is hidden from Anna; much else on the trip gives it away. Bo may change the practical information. */
const trip = () => ({
  id: "berlin", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", purpose: "Barnen ska få åka på Liseberg.", note: "Liseberg i hemlighet",
  access: { traveler: { nala: { parts: { info: "write" } } } },
  stops: [{ label: "Göteborg", sub: "25 sön", dayId: "d1" }], packing: [],
  places: [{ id: "lb", name: "Liseberg", address: "Örgrytevägen 5" }, { id: "park", name: "Lisebergs parkering", address: "Gatan 1" }, { id: "zoo", name: "Zoo", address: "Gatan 2" }],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Göteborg", summary: "Hela dagen på Liseberg.", icons: ["🎢"], start: "08:00", end: "18:00", activities: [
    { id: "a1", text: "Liseberg", placeIds: ["lb"], start: "10:00", hiddenFrom: ["anna"] },
    { id: "a2", text: "Bil", note: "Parkera vid Liseberg", placeIds: [], start: "09:00" },
    { id: "a3", text: "Zoo", placeIds: ["zoo"], start: "15:00" },
  ] }],
  budget: [{ id: "b1", category: "Nöje", paid: false, amount: 500, note: "Lisebergsbiljetter" }, { id: "b2", category: "Mat", paid: true, amount: 300 }],
  bookings: [{ id: "bk", name: "Entré", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "LB-1", placeId: "lb" },
    { id: "hotel", name: "Hotel", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "XY-1" }],
  tasks: [{ id: "k1", text: "Köp Liseberg-pass", done: false }, { id: "k2", text: "Boka hotell", done: false }],
  info: [{ id: "i1", title: "Parkering", text: "Nära", placeId: "park" }, { id: "i2", title: "Nödnummer", text: "112" }],
  expenses: [{ id: "e1", text: "Glass på Liseberg", category: "Mat/Fritid", amount: 60, paidBy: "bo", sharedBy: [] }],
  payments: [{ id: "p1", from: "anna", to: "bo", amount: 10, note: "för Liseberg" }],
  dreams: [{ id: "w1", title: "Åka Liseberg", category: "Nöje", source: "Bo", icon: "🎢", votes: 1 }, { id: "w2", title: "Zoo", category: "Nöje", source: "", icon: "🦁", votes: 0 }],
});

// REQ: AU-30 every text that gives away a hidden activity reaches those it is hidden from empty and marked hidden
test("AU-30 texts that give away a hidden activity are hidden", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const anna = await json(call(app, "/api/trips/berlin", await person(app, "anna", "traveler")));
  assert.deepEqual([anna.purpose, anna.hiddenPurpose, anna.note, anna.hiddenNote], ["", true, "", true]);
  assert.deepEqual([anna.days[0].summary, anna.days[0].hiddenSummary, anna.days[0].title], ["", true, "Göteborg"]);
  assert.deepEqual(anna.days[0].activities.map((a: { text: string }) => a.text), ["", "", "Zoo"], "a note that gives it away hides its activity");
  assert.deepEqual(anna.budget, [{ id: "b1", category: "", paid: false, amount: 500, hidden: true }, { id: "b2", category: "Mat", paid: true, amount: 300 }]);
  assert.deepEqual(anna.bookings[0], { id: "bk", name: "", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "LB-1", hidden: true });
  assert.equal(anna.bookings[1].name, "Hotel");
  assert.deepEqual(anna.tasks.map((k: { text: string; hidden?: boolean }) => [k.text, k.hidden]), [["", true], ["Boka hotell", undefined]]);
  assert.deepEqual(anna.info[0], { id: "i1", title: "", text: "", hidden: true }, "it links a place whose name gives it away");
  assert.equal(anna.info[1].title, "Nödnummer");
  assert.deepEqual([anna.expenses[0].text, anna.expenses[0].hidden, anna.expenses[0].amount], ["", true, 60]);
  assert.deepEqual(anna.payments[0], { id: "p1", from: "anna", to: "bo", amount: 10, hidden: true });
  assert.deepEqual(anna.dreams.map((w: { title: string; source: string }) => [w.title, w.source]), [["", ""], ["Zoo", ""]]);
  assert.deepEqual(anna.places.map((p: { id: string }) => p.id), ["zoo"]);
  const secret = (await json(call(app, "/api/trips/berlin/link", "a", "POST"))).secret;
  const follower = await json(call(app, "/api/trips/berlin", `link.berlin.${secret}`));
  assert.deepEqual([follower.purpose, follower.hiddenPurpose, follower.days[0].hiddenSummary], ["", true, true]);
  for (const role of ["traveler", "planner"]) { // Bo is not among those it is hidden from; a Planerare sees everything
    const bo = await json(call(app, "/api/trips/berlin", await person(app, "bo", role)));
    assert.deepEqual([bo.purpose, bo.hiddenPurpose, bo.info[0].title, bo.budget[0].note, bo.places.length], ["Barnen ska få åka på Liseberg.", undefined, "Parkering", "Lisebergsbiljetter", 3], role);
  }
});

// REQ: AU-30 the server rejects a change to a text hidden from the one making it; ticking a hidden task still works
test("AU-30 hidden texts cannot be overwritten by those they are hidden from", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const anna = await person(app, "anna", "traveler");
  const store = await json(call(app, "/api/trips/berlin", "a"));
  assert.equal(store.info[0].title, "Parkering");
  assert.equal((await change(app, anna, [{ op: "set", path: "info/0", value: { id: "i1", title: "Ny", text: "" } }])).status, 403);
  assert.equal((await change(app, anna, [{ op: "set", path: "info", value: [] }])).status, 403, "replacing the whole list");
  assert.equal((await change(app, anna, [{ op: "set", path: "tasks/0/done", value: true }])).status, 200, "ticking");
  const after = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual([after.info[0].title, after.tasks[0].done], ["Parkering", true]);
  assert.equal((await change(app, anna, [{ op: "set", path: "info/1/text", value: "112 eller 1177" }])).status, 200, "a text that is not hidden");
});
