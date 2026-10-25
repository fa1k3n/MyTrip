import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
const trip = (id: string) => ({
  id, revision: 1, title: id, timezone: "Europe/Berlin", stops: [], places: [], travelers: [{ id: "anna", name: "Anna", packing: ["Pass"] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
  tasks: [{ id: "k1", text: "Boka", done: false }], packing: ["Laddare"],
  bookings: [{ id: "hotel", name: "Hotel", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "XY-1" }],
});
const setup = () => {
  const store = memoryStore([trip("berlin"), trip("skane")]);
  return { store, app: createApp(store, tokens, { auth }) };
};
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, init: { method?: string; body?: unknown; auth?: string; cookie?: string; ip?: string } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.auth ? { authorization: `Bearer ${init.auth}` } : {}),
      ...(init.cookie ? { cookie: init.cookie } : {}),
      "cf-connecting-ip": init.ip ?? "203.0.113.1",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const login = async (app: App, password = auth.adminPassword, ip?: string) => call(app, "/api/login", { method: "POST", body: { password }, ip });
const cookieOf = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0];
const makeLink = async (app: App, id: string) => (await (await call(app, `/api/trips/${id}/link`, { method: "POST", auth: "a" })).json()).secret as string;

test("AU-04 the admin logs in with the password and gets a safe session cookie", async () => {
  const { app } = setup();
  const r = await login(app);
  assert.equal(r.status, 204);
  const set = r.headers.get("set-cookie") ?? "";
  for (const part of ["HttpOnly", "Secure", "SameSite=Strict", "Max-Age=2592000"]) assert.ok(set.includes(part), `${part} in ${set}`);
  const me = await call(app, "/api/me", { cookie: cookieOf(r) });
  assert.deepEqual(await me.json(), { role: "admin" });
  assert.equal((await call(app, "/api/trips", { cookie: cookieOf(r) })).status, 200);
});

test("AU-04 a wrong password or a forged cookie gives no access", async () => {
  const { app } = setup();
  assert.equal((await login(app, "fel")).status, 401);
  assert.equal((await call(app, "/api/me", { cookie: "session=admin.9999999999.forged" })).status, 401);
});

test("AU-04 the admin logs out", async () => {
  const { app } = setup();
  const r = await call(app, "/api/logout", { method: "POST" });
  assert.equal(r.status, 204);
  assert.ok((r.headers.get("set-cookie") ?? "").includes("Max-Age=0"));
});

test("AU-04 login is off when no password is configured", async () => {
  const app = createApp(memoryStore([trip("berlin")]), tokens);
  assert.equal((await login(app)).status, 404);
});

test("AU-05 failed logins are limited to 5 per address", async () => {
  const { app } = setup();
  for (let i = 0; i < 5; i++) assert.equal((await login(app, "fel", "198.51.100.7")).status, 401);
  assert.equal((await login(app, auth.adminPassword, "198.51.100.7")).status, 429); // even the right password waits
  assert.equal((await login(app, auth.adminPassword, "198.51.100.8")).status, 204); // other addresses are not affected
});

test("AU-01 AU-06 the admin creates, reads and replaces a trip's share link", async () => {
  const { app } = setup();
  assert.equal((await call(app, "/api/trips/berlin/link", { auth: "a" })).status, 404);
  const first = await makeLink(app, "berlin");
  assert.match(first, /^[A-Za-z0-9_-]{22,}$/); // at least 128 random bits, base64url
  assert.equal((await (await call(app, "/api/trips/berlin/link", { auth: "a" })).json()).secret, first);
  const second = await makeLink(app, "berlin");
  assert.notEqual(second, first);
  assert.equal((await call(app, "/api/me", { auth: `link.berlin.${first}` })).status, 401); // the old link stops working at once
  assert.deepEqual(await (await call(app, "/api/me", { auth: `link.berlin.${second}` })).json(), { role: "link", tripId: "berlin" });
  for (const who of ["r", "p"]) assert.equal((await call(app, "/api/trips/berlin/link", { method: "POST", auth: who })).status, 403);
});

test("AU-03 a link shows only its own trip, without booking references, and no settings", async () => {
  const { app } = setup();
  const key = `link.berlin.${await makeLink(app, "berlin")}`;
  const list = await (await call(app, "/api/trips", { auth: key })).json();
  assert.deepEqual(list.map((t: { id: string }) => t.id), ["berlin"]);
  assert.equal((await call(app, "/api/trips/skane", { auth: key })).status, 404);
  assert.equal((await call(app, "/api/settings", { auth: key })).status, 403);
  assert.equal((await call(app, "/api/trips/berlin/link", { auth: key })).status, 403);
});

test("AU-03 the common link is read-only: the server rejects every change", async () => {
  const { app, store } = setup();
  const key = `link.berlin.${await makeLink(app, "berlin")}`;
  const change = (ops: unknown[]) => call(app, "/api/trips/berlin/changes", { method: "POST", auth: key, body: { baseRevision: 1, ops, reason: "tick" } });
  for (const ops of [
    [{ op: "set", path: "tasks/0/done", value: true }],
    [{ op: "set", path: "packed", value: ["Laddare"] }],
    [{ op: "set", path: "travelers/0/packed", value: ["Pass"] }],
    [{ op: "set", path: "title", value: "Kapad" }],
    [{ op: "add", path: "packing/-", value: "Mer" }],
    [{ op: "add", path: "expenses/-", value: { id: "e1", text: "Glass", category: "Övrigt", amount: 60, paidBy: "anna", addedBy: "anna" } }],
  ]) assert.equal((await change(ops)).status, 403, JSON.stringify(ops));
  const t = (await store.load("berlin"))!;
  assert.deepEqual([t.revision, t.tasks[0].done, t.title, t.expenses.length], [1, false, "berlin", 0]);
});

test("AU-07 no link, an unknown link or a link to another trip gives 401", async () => {
  const { app } = setup();
  const secret = await makeLink(app, "berlin");
  assert.equal((await call(app, "/api/me")).status, 401);
  assert.equal((await call(app, "/api/me", { auth: "link.berlin.wrong" })).status, 401);
  assert.equal((await call(app, "/api/me", { auth: `link.skane.${secret}` })).status, 401);
});

test("AU-09 the MCP tokens keep working", async () => {
  const { app } = setup();
  assert.deepEqual(await (await call(app, "/api/me", { auth: "p" })).json(), { role: "propose" });
});

// REQ: AU-17 the common link gets no budget, expenses, payments or bookings from the server
test("AU-17 a Följare does not see money or bookings", async () => {
  const store = memoryStore([{ ...trip("berlin"), budgetMax: 9000, budget: [{ id: "b1", category: "Boende", amount: 5000, paid: true }],
    expenses: [{ id: "e1", text: "Glass", category: "Övrigt", amount: 60, paidBy: "anna" }], payments: [] }]);
  const app = createApp(store, tokens, { auth });
  const key = `link.berlin.${await makeLink(app, "berlin")}`;
  for (const path of ["/api/trips/berlin", "/api/trips"]) {
    const body = await (await call(app, path, { auth: key })).json();
    const t = Array.isArray(body) ? body[0] : body;
    assert.deepEqual([t.bookings, t.budget, t.expenses, t.payments, t.budgetMax], [[], [], [], [], undefined], path);
    assert.equal(t.days.length, 1);
  }
  const admin = await (await call(app, "/api/trips/berlin", { auth: "a" })).json();
  assert.deepEqual([admin.bookings.length, admin.budget.length, admin.expenses.length, admin.budgetMax], [1, 1, 1, 9000]);
});

// REQ: AU-19 a Följare only gets what Uppleva shows: no wishes, tasks, practical information or packing lists
test("AU-19 a Följare gets no wishes, tasks, info or packing", async () => {
  const store = memoryStore([{ ...trip("berlin"), dreams: [{ id: "w1", title: "Zoo", category: "Natur", source: "x", icon: "🦁", votes: 1 }],
    info: [{ id: "i1", title: "Parkering" }] }]);
  const app = createApp(store, tokens, { auth });
  const t = await (await call(app, "/api/trips/berlin", { auth: `link.berlin.${await makeLink(app, "berlin")}` })).json();
  assert.deepEqual([t.dreams, t.tasks, t.info, t.packing, t.packed, t.travelers[0].packing, t.travelers[0].packed], [[], [], [], [], [], [], []]);
  assert.deepEqual([t.days.length, t.travelers[0].name], [1, "Anna"]);
});
