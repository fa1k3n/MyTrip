import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
const trip = (id: string) => ({
  id, revision: 1, title: id, timezone: "Europe/Berlin", stops: [], places: [], tasks: [], bookings: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] },
    { id: "d2", date: "2026-10-26", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
});
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) => app.request(path, {
  method: init.method ?? "GET", headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const cookieOf = (r: Response) => (r.headers.getSetCookie().find((x) => x.startsWith("session=")) ?? "").split(";")[0]!;
const PW = "ett långt lösenord";

async function setup(now = "2026-10-26T10:00:00Z") {
  const store = memoryStore([trip("berlin")]);
  const app = createApp(store, tokens, { auth, now: () => new Date(now) });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  const make = async (name: string, email: string, consent?: boolean) => {
    const { user, setup: s } = await json(call(app, "/api/users", { method: "POST", cookie: admin, body: { name, email } }));
    return { id: user.id as string, cookie: cookieOf(await call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: s.secret, password: PW, ...(consent ? { consent } : {}) } })) };
  };
  return { store, app, admin, make };
}

// REQ: US-26 the beta notice is accepted when the account is made, or at the next login
test("US-26 an account accepts the beta notice before using the app", async () => {
  const { app, make } = await setup();
  const eva = await make("Eva", "eva@example.org", true);
  assert.equal((await json(call(app, "/api/me", { cookie: eva.cookie }))).consent, true);
  const olle = await make("Olle", "olle@example.org");
  assert.equal((await json(call(app, "/api/me", { cookie: olle.cookie }))).consent, false);
  assert.equal((await call(app, "/api/consent", { method: "POST", cookie: olle.cookie })).status, 204);
  assert.equal((await json(call(app, "/api/me", { cookie: olle.cookie }))).consent, true);
  assert.equal((await call(app, "/api/consent", { method: "POST" })).status, 401);
});

// REQ: US-27 feedback from an account that has accepted, read only by the superuser
test("US-27 a user sends feedback with the page they were on; the superuser reads it", async () => {
  const { app, make } = await setup();
  const eva = await make("Eva", "eva@example.org", true); // superuser
  const olle = await make("Olle", "olle@example.org");
  const send = (cookie: string, body: unknown) => call(app, "/api/feedback", { method: "POST", cookie, body });
  assert.equal((await send(olle.cookie, { text: "Hej", page: "nala" })).status, 403, "not before the notice is accepted");
  await call(app, "/api/consent", { method: "POST", cookie: olle.cookie });
  assert.equal((await send(olle.cookie, { text: "  ", page: "nala" })).status, 400);
  assert.equal((await send(olle.cookie, { text: "x".repeat(2001), page: "nala" })).status, 400);
  assert.equal((await send(olle.cookie, { text: "Svårt att hitta budgeten", page: "nala", tripId: "berlin" })).status, 201);
  assert.equal((await call(app, "/api/feedback", { cookie: olle.cookie })).status, 403);
  const list = await json(call(app, "/api/feedback", { cookie: eva.cookie }));
  assert.equal(list.length, 1);
  assert.deepEqual({ name: list[0].name, text: list[0].text, page: list[0].page, tripId: list[0].tripId, at: list[0].at },
    { name: "Olle", text: "Svårt att hitta budgeten", page: "nala", tripId: "berlin", at: "2026-10-26T10:00:00.000Z" });
});

// REQ: US-28 which of the four pages a consenting user opens, per day, and nothing for anyone else
test("US-28 page opens are kept per person, page and day, only after the notice is accepted", async () => {
  const { app, store, make } = await setup();
  const eva = await make("Eva", "eva@example.org", true); // owns berlin as the first superuser
  const seen = (cookie: string, tab: string) => call(app, "/api/trips/berlin/seen", { method: "POST", cookie, body: { tab } });
  assert.equal((await seen(eva.cookie, "up")).status, 204);
  assert.equal((await seen(eva.cookie, "up")).status, 204); // the same day once
  assert.equal((await seen(eva.cookie, "nope")).status, 400);
  assert.deepEqual(await store.usage(), [{ tripId: "berlin", who: eva.id, tab: "up", day: "2026-10-26" }]);
  const olle = await make("Olle", "olle@example.org");
  assert.equal((await call(app, "/api/trips/berlin/seen", { method: "POST", cookie: olle.cookie, body: { tab: "up" } })).status, 404, "not his trip");
});

// REQ: US-29 the superuser's overview: active people, Uppleva during the trip, Minnas used
test("US-29 the overview shows per trip who is active, Uppleva during the trip and the memories", async () => {
  const { app, make } = await setup();
  const eva = await make("Eva", "eva@example.org", true);
  await call(app, "/api/trips/berlin/seen", { method: "POST", cookie: eva.cookie, body: { tab: "up" } });
  await call(app, "/api/trips/berlin/changes", { method: "POST", cookie: eva.cookie, body: { baseRevision: 1, ops: [{ op: "set", path: "purpose", value: "x" }] } });
  const [o] = await json(call(app, "/api/usage", { cookie: eva.cookie }));
  assert.deepEqual({ tripId: o.tripId, owner: o.owner, from: o.from, to: o.to, memories: o.memories }, { tripId: "berlin", owner: "Eva", from: "2026-10-25", to: "2026-10-26", memories: 0 });
  assert.deepEqual(o.people, [{ name: "Eva", days: { dr: 0, nala: 0, up: 1, mi: 0 }, upDuring: 1, changes: 1 }]);
  const olle = await make("Olle", "olle@example.org", true);
  assert.equal((await call(app, "/api/usage", { cookie: olle.cookie })).status, 403);
});
