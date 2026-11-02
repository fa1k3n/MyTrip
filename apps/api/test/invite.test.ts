import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
const trip = (id: string) => ({
  id, revision: 1, title: `Resan ${id}`, timezone: "Europe/Berlin", stops: [], places: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
  tasks: [], bookings: [],
});
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) => app.request(path, {
  method: init.method ?? "GET",
  headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.1", ...(init.cookie ? { cookie: init.cookie } : {}) },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
});
const cookieOf = (r: Response) => (r.headers.getSetCookie().find((x) => x.startsWith("session=")) ?? "").split(";")[0]!;
const PW = "ett långt lösenord";

/** The admin, Eva the superuser account, and Olle who owns the trip "olle" with the travelers Anna and Bo. */
async function setup() {
  const store = memoryStore([trip("berlin")]);
  const app = createApp(store, tokens, { auth });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  const login = async (name: string, email: string) => {
    const { user, setup } = await (await call(app, "/api/users", { method: "POST", cookie: admin, body: { name, email } })).json();
    return cookieOf(await call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: setup.secret, password: PW } }));
  };
  await login("Eva", "eva@example.org");
  const olle = await login("Olle", "olle@example.org");
  const made = await (await call(app, "/api/trips", { method: "POST", cookie: olle, body: { title: "Olles resa" } })).json();
  await call(app, `/api/trips/${made.id}/changes`, { method: "POST", cookie: olle, body: { baseRevision: made.revision, ops: [
    { op: "add", path: "travelers/-", value: { id: "anna", name: "Anna", packing: [] } }, { op: "add", path: "travelers/-", value: { id: "bo", name: "Bo", packing: [] } }] } });
  const tie = (who: string, account: string | null, cookie = olle) => call(app, `/api/trips/${made.id}/people/${who}`, { method: "PUT", cookie, body: { role: "traveler", account } });
  const invite = (who: string, cookie = olle, body: unknown = {}) => call(app, `/api/trips/${made.id}/people/${who}/invite`, { method: "POST", cookie, body });
  return { store, app, admin, olle, tripId: made.id as string, tie, invite };
}

// REQ: US-30 inviting a traveler with an address and no account creates the account and gives a password link
test("US-30 an invitation creates the account with the traveler's name and a password link", async () => {
  const { app, store, tie, invite, tripId } = await setup();
  assert.equal((await invite("anna")).status, 409); // no address yet
  await tie("anna", "anna@example.org");
  const r = await invite("anna");
  assert.equal(r.status, 201, await r.clone().text());
  const b = await r.json();
  assert.equal(typeof b.setup.secret, "string");
  assert.equal(b.user, "anna");
  const u = (await store.users()).find((x) => x.email === "anna@example.org")!;
  assert.deepEqual([u.name, u.superuser, u.ai, u.invitedBy], ["Anna", false, false, "olle"]);
  const done = await call(app, "/api/setup", { method: "POST", body: { user: u.id, secret: b.setup.secret, password: PW } });
  assert.equal(done.status, 204);
  const trips = await (await call(app, "/api/trips", { cookie: cookieOf(done) })).json();
  assert.deepEqual(trips.map((t: { id: string }) => t.id), [tripId]); // US-22: the trip at once
});

// REQ: US-30 an account that never logged in gets a new link; one that can log in gets none
test("US-30 a new link only for an account without a login; otherwise it says to log in", async () => {
  const { app, admin, tie, invite } = await setup();
  await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Bosse", email: "bo@example.org" } }); // made, never used
  await tie("bo", "bo@example.org");
  const fresh = await invite("bo");
  assert.equal(fresh.status, 200);
  assert.ok((await fresh.json()).setup.secret);
  await tie("anna", "eva@example.org"); // a superuser who can log in
  const r = await invite("anna");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { exists: true, mayRenew: false });
});

// REQ: US-30 only those who manage the trip may invite
test("US-30 a traveler or a stranger cannot invite", async () => {
  const { app, admin, tie, invite } = await setup();
  await tie("anna", "anna@example.org");
  const { setup: s } = await (await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Kim", email: "kim@example.org" } })).json();
  const kim = cookieOf(await call(app, "/api/setup", { method: "POST", body: { user: "kim", secret: s.secret, password: PW } }));
  assert.ok([403, 404].includes((await invite("anna", kim)).status)); // a stranger does not even see the trip
  const { setup: a } = await (await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Ada", email: "ada@example.org" } })).json();
  const ada = cookieOf(await call(app, "/api/setup", { method: "POST", body: { user: "ada", secret: a.secret, password: PW } }));
  await tie("bo", "ada@example.org"); // Ada travels as Bo, a Resenär
  assert.equal((await invite("anna", ada)).status, 403);
});

// REQ: US-32 the inviter makes a new password link for the account they invited, after asking
test("US-32 the inviter can renew the link of their own invitation, not of others", async () => {
  const { app, store, admin, tie, invite } = await setup();
  await tie("anna", "anna@example.org");
  const first = await (await invite("anna")).json();
  await call(app, "/api/setup", { method: "POST", body: { user: first.user, secret: first.setup.secret, password: PW } });
  const asked = await (await invite("anna")).json();
  assert.deepEqual(asked, { exists: true, mayRenew: true }); // the question first
  const renewed = await invite("anna", undefined, { renew: true });
  assert.equal(renewed.status, 200);
  const { setup: s } = await renewed.json();
  assert.ok(s.secret && s.secret !== first.setup.secret);
  // an account invited by someone else (here: the admin) is not the inviter's to renew
  await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Bo", email: "bo@example.org" } });
  const bo = (await store.users()).find((u) => u.email === "bo@example.org")!;
  await store.saveUser({ ...bo, passwordHash: "x" });
  await tie("bo", "bo@example.org");
  assert.deepEqual(await (await invite("bo", undefined, { renew: true })).json(), { exists: true, mayRenew: false });
  // untied from the trip: no longer the inviter's to renew
  await tie("anna", null);
  assert.equal((await invite("anna", undefined, { renew: true })).status, 409);
});
