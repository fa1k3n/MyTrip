import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import { checkPassword, hashPassword } from "../src/users.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const google = { clientId: "klient.apps.example", clientSecret: "g-hemlis" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32), google };
const trip = (id: string, travelers = [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }]) => ({
  id, revision: 1, title: id, timezone: "Europe/Berlin", stops: [], places: [], travelers,
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
  tasks: [], bookings: [],
});
type App = ReturnType<typeof createApp>;
type Init = { method?: string; body?: unknown; auth?: string; cookie?: string; ip?: string };
const call = (app: App, path: string, init: Init = {}) => app.request(path, {
  method: init.method ?? "GET",
  headers: {
    "content-type": "application/json", "cf-connecting-ip": init.ip ?? "203.0.113.1",
    ...(init.auth ? { authorization: `Bearer ${init.auth}` } : {}), ...(init.cookie ? { cookie: init.cookie } : {}),
  },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
/** The session cookie a response sets, among the others it may set. */
const cookieOf = (r: Response) => (r.headers.getSetCookie().find((x) => x.startsWith("session=")) ?? r.headers.getSetCookie()[0] ?? "").split(";")[0]!;
const PW = "ett långt lösenord";

/** A store with two trips, the app, and the admin password session (US-18). */
async function setup(opts: { fetch?: typeof fetch } = {}) {
  const store = memoryStore([trip("berlin"), trip("skane")]);
  const app = createApp(store, tokens, { auth, ...opts });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  return { store, app, admin };
}
/** Creates an account as the admin and sets its password through the password link; returns its session cookie. */
async function account(app: App, admin: string, name: string, email: string) {
  const r = await call(app, "/api/users", { method: "POST", cookie: admin, body: { name, email } });
  assert.equal(r.status, 201, await r.clone().text());
  const { user, setup } = await r.json();
  const done = await call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: setup.secret, password: PW } });
  assert.equal(done.status, 204);
  return { id: user.id as string, cookie: cookieOf(done) };
}
const tripIds = async (app: App, cookie: string) => (await json(call(app, "/api/trips", { cookie }))).map((t: { id: string }) => t.id);

// REQ: US-01 US-03 accounts are created only by the superuser, with a unique address in lower case
test("US-01 US-03 the superuser adds accounts; bad or taken addresses are rejected", async () => {
  const { app, admin, store } = await setup();
  const r = await json(call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Johan", email: " Johan@Example.ORG " } }));
  assert.deepEqual({ id: r.user.id, email: r.user.email, superuser: r.user.superuser }, { id: "johan", email: "johan@example.org", superuser: true }); // the first account is the superuser
  assert.equal((await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "", email: "x@example.org" } })).status, 400);
  assert.equal((await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "X", email: "inte-en-adress" } })).status, 400);
  assert.equal((await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Johan 2", email: "JOHAN@example.org" } })).status, 409);
  const second = await json(call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Johan", email: "j2@example.org" } }));
  assert.equal(second.user.id, "johan-2"); // readable and unique
  assert.equal(second.user.superuser, false);
  assert.ok((await store.users()).every((u) => typeof u.createdAt === "string"));
});

// REQ: US-01 there is no way to register oneself
test("US-01 nobody without the superuser's rights creates an account", async () => {
  const { app, admin } = await setup();
  const eva = await account(app, admin, "Eva", "eva@example.org"); // the first account is the superuser
  const olle = await account(app, admin, "Olle", "olle@example.org");
  assert.equal((await call(app, "/api/users", { method: "POST", body: { name: "Mallory", email: "m@example.org" } })).status, 401);
  assert.equal((await call(app, "/api/users", { method: "POST", cookie: olle.cookie, body: { name: "Mallory", email: "m@example.org" } })).status, 403);
  assert.equal((await call(app, "/api/users", { method: "POST", cookie: eva.cookie, body: { name: "Mia", email: "mia@example.org" } })).status, 201);
});

// REQ: US-02 the list of accounts is the superuser's alone and never holds a hash
test("US-02 the superuser lists accounts with how they log in; nobody else may", async () => {
  const { app, admin } = await setup();
  await account(app, admin, "Eva", "eva@example.org");
  await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Olle", email: "olle@example.org" } });
  const list = await json(call(app, "/api/users", { cookie: admin }));
  assert.deepEqual(list.map((u: { id: string; password: boolean; google: boolean }) => [u.id, u.password, u.google]), [["eva", true, false], ["olle", false, false]]);
  assert.ok(list[0].lastLogin, "last login");
  assert.ok(!JSON.stringify(list).includes("pbkdf2"), "no hash is sent");
  const eva2 = await account(app, admin, "Bo", "bo@example.org");
  assert.equal((await call(app, "/api/users", { cookie: eva2.cookie })).status, 403);
});

// REQ: US-04 a password link: one-time, 7 days, at least 128 random bits; a new one replaces the old
test("US-04 the password link is one-time, lasts 7 days and a new one replaces the old", async () => {
  let now = Date.parse("2026-11-01T12:00:00Z");
  const store = memoryStore([trip("berlin")]);
  const app = createApp(store, tokens, { auth, now: () => new Date(now) });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  const { user, setup } = await json(call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Eva", email: "eva@example.org" } }));
  assert.match(setup.secret, /^[A-Za-z0-9_-]{22,}$/);
  assert.equal(setup.expires, "2026-11-08T12:00:00.000Z");
  const info = (secret: string) => call(app, "/api/setup/info", { method: "POST", body: { user: user.id, secret } });
  assert.deepEqual(await json(info(setup.secret)), { name: "Eva", email: "eva@example.org" });
  const again = await json(call(app, `/api/users/${user.id}/setup`, { method: "POST", cookie: admin }));
  assert.equal((await info(setup.secret)).status, 410); // the old link stops working
  assert.equal((await info(again.secret)).status, 200);
  now += 7 * 86_400_000 + 1;
  assert.equal((await info(again.secret)).status, 410); // expired
  assert.ok(!JSON.stringify(await store.users()).includes(again.secret), "only a hash of the secret is kept");
});

// REQ: US-05 choosing a password: at least 10 characters, then logged in, and the link is used up
test("US-05 a password of at least 10 characters is chosen once and logs the user in", async () => {
  const { app, admin } = await setup();
  const { user, setup: s } = await json(call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Eva", email: "eva@example.org" } }));
  const choose = (password: string) => call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: s.secret, password } });
  assert.equal((await choose("kort")).status, 400);
  const r = await choose(PW);
  assert.equal(r.status, 204);
  assert.equal((await json(call(app, "/api/me", { cookie: cookieOf(r) }))).user.id, "eva");
  assert.equal((await choose("ett annat långt lösenord")).status, 410); // used
});

// REQ: US-06 PBKDF2-SHA-256 with a salt per account and at least 100 000 iterations
test("US-06 passwords are kept only as salted PBKDF2 hashes", async () => {
  const a = await hashPassword(PW), b = await hashPassword(PW);
  assert.match(a, /^pbkdf2-sha256\$(\d+)\$/);
  assert.ok(Number(a.split("$")[1]) >= 100_000);
  assert.notEqual(a, b); // a random salt each time
  assert.ok(!a.includes(PW));
  assert.equal(await checkPassword(PW, a), true);
  assert.equal(await checkPassword("fel lösenord!", a), false);
  const { app, admin, store } = await setup();
  await account(app, admin, "Eva", "eva@example.org");
  const [u] = await store.users();
  assert.ok(u!.passwordHash?.startsWith("pbkdf2-sha256$"));
  assert.ok(!JSON.stringify(await store.users()).includes(PW));
});

// REQ: US-07 US-11 login with address and password; the same answer for an unknown address and a wrong password
test("US-07 US-11 a user logs in with address and password and gets a safe session cookie", async () => {
  const { app, admin } = await setup();
  await account(app, admin, "Eva", "eva@example.org");
  const login = (email: string, password: string) => call(app, "/api/login", { method: "POST", body: { email, password }, ip: "198.51.100.9" });
  const wrong = await login("eva@example.org", "fel lösenord!"), unknown = await login("ingen@example.org", PW);
  assert.equal(wrong.status, 401);
  assert.deepEqual([unknown.status, await unknown.json()], [401, await wrong.json()]);
  const r = await login("EVA@example.org", PW);
  assert.equal(r.status, 204);
  const set = r.headers.get("set-cookie") ?? "";
  for (const part of ["HttpOnly", "Secure", "SameSite=Strict", "Max-Age=2592000"]) assert.ok(set.includes(part), `${part} in ${set}`);
  const me = await json(call(app, "/api/me", { cookie: cookieOf(r) }));
  assert.deepEqual(me.user, { id: "eva", name: "Eva", superuser: true });
});

// REQ: US-08 failed logins are limited per address and per account
test("US-08 five failed logins lock the account for a while, from any address", async () => {
  const { app, admin } = await setup();
  await account(app, admin, "Eva", "eva@example.org");
  for (let i = 0; i < 5; i++) assert.equal((await call(app, "/api/login", { method: "POST", body: { email: "eva@example.org", password: "fel lösenord!" }, ip: `198.51.100.${i + 20}` })).status, 401);
  assert.equal((await call(app, "/api/login", { method: "POST", body: { email: "eva@example.org", password: PW }, ip: "198.51.100.99" })).status, 429);
});

// REQ: US-11 disabling or removing an account logs it out at once; logging out works
test("US-11 US-12 a disabled or removed account is logged out at once", async () => {
  const { app, admin } = await setup();
  await account(app, admin, "Eva", "eva@example.org");
  const olle = await account(app, admin, "Olle", "olle@example.org");
  assert.equal((await call(app, "/api/me", { cookie: olle.cookie })).status, 200);
  assert.equal((await call(app, "/api/users/olle", { method: "PATCH", cookie: admin, body: { disabled: true } })).status, 200);
  assert.equal((await call(app, "/api/me", { cookie: olle.cookie })).status, 401);
  assert.equal((await call(app, "/api/login", { method: "POST", body: { email: "olle@example.org", password: PW } })).status, 401);
  await call(app, "/api/users/olle", { method: "PATCH", cookie: admin, body: { disabled: false } });
  assert.equal((await call(app, "/api/me", { cookie: olle.cookie })).status, 200);
  assert.equal((await call(app, "/api/users/olle", { method: "DELETE", cookie: admin })).status, 204);
  assert.equal((await call(app, "/api/me", { cookie: olle.cookie })).status, 401);
  assert.ok(((await call(app, "/api/logout", { method: "POST" })).headers.get("set-cookie") ?? "").includes("Max-Age=0"));
});

// REQ: US-12 the superuser manages accounts but never locks themself out; there is always a superuser
test("US-12 a superuser cannot disable, remove or demote themself", async () => {
  const { app, admin } = await setup();
  const eva = await account(app, admin, "Eva", "eva@example.org");
  await account(app, admin, "Olle", "olle@example.org");
  for (const body of [{ disabled: true }, { superuser: false }]) assert.equal((await call(app, "/api/users/eva", { method: "PATCH", cookie: eva.cookie, body })).status, 403);
  assert.equal((await call(app, "/api/users/eva", { method: "DELETE", cookie: eva.cookie })).status, 403);
  assert.equal((await call(app, "/api/users/eva", { method: "DELETE", cookie: admin })).status, 403); // the password acts as the first superuser (US-18)
  const up = await json(call(app, "/api/users/olle", { method: "PATCH", cookie: eva.cookie, body: { superuser: true, ai: true } }));
  assert.deepEqual([up.superuser, up.ai], [true, true]);
  assert.equal((await call(app, "/api/users/olle", { method: "PATCH", cookie: eva.cookie, body: { superuser: false } })).status, 200); // another one's flag may go
});

// REQ: US-09 US-10 Google login: code flow with state and PKCE, verified address of an existing account, tied to Google's id
test("US-09 Google login lets in only an existing account with a verified address", async () => {
  let identity: Record<string, unknown> = {};
  const seen: { url: string; body: string }[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), body: String(init?.body ?? "") });
    const payload = btoa(JSON.stringify({ iss: "https://accounts.google.com", aud: google.clientId, exp: Math.floor(Date.now() / 1000) + 600, ...identity })).replace(/=+$/, "");
    return new Response(JSON.stringify({ id_token: `e30.${payload}.sig` }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const { app, admin, store } = await setup({ fetch: fakeFetch });
  await account(app, admin, "Eva", "eva@example.org");
  await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Olle", email: "olle@example.org" } });
  assert.deepEqual(await json(call(app, "/api/auth/config")), { google: true });
  /** Starts at our server, follows Google's redirect back with a code, and returns the final answer. */
  const roundTrip = async (state?: string) => {
    const start = await call(app, "/api/auth/google");
    assert.equal(start.status, 302);
    const to = new URL(start.headers.get("location")!);
    assert.equal(to.origin + to.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(to.searchParams.get("code_challenge_method"), "S256");
    assert.ok(to.searchParams.get("code_challenge") && to.searchParams.get("state"));
    assert.equal(to.searchParams.get("redirect_uri"), "http://localhost/api/auth/google/callback");
    const set = start.headers.get("set-cookie") ?? "";
    assert.ok(set.includes("SameSite=Lax") && set.includes("HttpOnly"), set);
    return call(app, `/api/auth/google/callback?code=kod&state=${state ?? to.searchParams.get("state")}`, { cookie: cookieOf(start) });
  };
  identity = { sub: "g-1", email: "Olle@example.org", email_verified: true };
  const ok = await roundTrip();
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get("location"), "/");
  assert.ok(seen.at(-1)!.body.includes("code_verifier="), "PKCE verifier sent with the code");
  assert.equal((await json(call(app, "/api/me", { cookie: cookieOf(ok) }))).user.id, "olle");
  assert.equal((await store.users()).find((u) => u.id === "olle")?.googleId, "g-1");
  identity = { sub: "g-1", email: "nytt-namn@example.org", email_verified: true }; // later logins match on Google's id
  assert.equal((await roundTrip()).headers.get("location"), "/");
  assert.equal((await roundTrip("forged")).headers.get("location"), "/#login=fel"); // state must match
  identity = { sub: "g-2", email: "eva@example.org", email_verified: false };
  assert.equal((await roundTrip()).headers.get("location"), "/#login=fel");
  identity = { sub: "g-3", email: "okand@example.org", email_verified: true };
  assert.equal((await roundTrip()).headers.get("location"), "/#login=nokonto");
  assert.equal((await store.users()).length, 2); // no account is created
});

// REQ: US-10 Google login is off without the client id and secret
test("US-10 without the Google secrets there is no Google login", async () => {
  const app = createApp(memoryStore([]), tokens, { auth: { adminPassword: "x", sessionKey: "k".repeat(32) } });
  assert.deepEqual(await json(call(app, "/api/auth/config")), { google: false });
  assert.equal((await call(app, "/api/auth/google")).status, 404);
});

// REQ: US-13 US-14 own trips: created ones belong to their creator, existing ones to the first superuser
test("US-13 US-14 a user sees and manages only their own trips", async () => {
  const { app, admin } = await setup();
  const eva = await account(app, admin, "Eva", "eva@example.org"); // first superuser: owns berlin and skane
  const olle = await account(app, admin, "Olle", "olle@example.org");
  assert.deepEqual(await tripIds(app, olle.cookie), []);
  const made = await json(call(app, "/api/trips", { method: "POST", cookie: olle.cookie, body: { title: "Olles resa" } }));
  assert.deepEqual(await tripIds(app, olle.cookie), [made.id]);
  assert.equal((await call(app, "/api/trips/berlin", { cookie: olle.cookie })).status, 404);
  assert.equal((await call(app, "/api/trips/berlin/changes", { method: "POST", cookie: olle.cookie, body: { baseRevision: 1, ops: [] } })).status, 404);
  const me = await json(call(app, "/api/me", { cookie: eva.cookie }));
  assert.deepEqual(me.trips.berlin, { role: "admin", roles: ["owner"] });
  // the owner changes the plan at once, manages links and permissions (AU-22), and deletes the trip; the log is not theirs
  const r = await call(app, `/api/trips/${made.id}/changes`, { method: "POST", cookie: olle.cookie, body: { baseRevision: 1, ops: [{ op: "set", path: "purpose", value: "Sol" }] } });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await json(call(app, `/api/trips/${made.id}`, { cookie: olle.cookie }))).purpose, "Sol");
  assert.equal((await call(app, `/api/trips/${made.id}/link`, { method: "POST", cookie: olle.cookie })).status, 201);
  const access = await call(app, `/api/trips/${made.id}/changes`, { method: "POST", cookie: olle.cookie, body: { baseRevision: 2, ops: [{ op: "set", path: "access", value: {} }] } });
  assert.equal(access.status, 200); // AU-22
  assert.equal((await call(app, "/api/log", { cookie: olle.cookie })).status, 403);
  assert.equal((await call(app, "/api/settings", { method: "PUT", cookie: olle.cookie, body: {} })).status, 403);
  assert.equal((await call(app, `/api/trips/${made.id}`, { method: "DELETE", cookie: olle.cookie })).status, 204);
  assert.equal((await call(app, "/api/trips/skane", { method: "DELETE", cookie: olle.cookie })).status, 404);
});

// REQ: US-13 the trips of a removed account go to the superuser who removes it
test("US-13 removing an account gives its trips to the superuser who removes it", async () => {
  const { app, admin } = await setup();
  const eva = await account(app, admin, "Eva", "eva@example.org");
  const olle = await account(app, admin, "Olle", "olle@example.org");
  const made = await json(call(app, "/api/trips", { method: "POST", cookie: olle.cookie, body: { title: "Olles resa" } }));
  const mia = await account(app, admin, "Mia", "mia@example.org");
  await call(app, "/api/users/mia", { method: "PATCH", cookie: eva.cookie, body: { superuser: true } });
  await call(app, "/api/users/olle", { method: "DELETE", cookie: mia.cookie });
  assert.deepEqual((await json(call(app, "/api/me", { cookie: mia.cookie }))).trips[made.id].roles, ["owner"]);
});

// REQ: US-15 the superuser sees every trip and the owner's name of others' trips
test("US-15 US-24 the superuser sees all trips, with the owner's name and no role on others' trips", async () => {
  const { app, admin } = await setup();
  const eva = await account(app, admin, "Eva", "eva@example.org");
  const olle = await account(app, admin, "Olle", "olle@example.org");
  const made = await json(call(app, "/api/trips", { method: "POST", cookie: olle.cookie, body: { title: "Olles resa" } }));
  assert.deepEqual((await tripIds(app, eva.cookie)).sort(), ["berlin", made.id, "skane"].sort());
  const me = await json(call(app, "/api/me", { cookie: eva.cookie }));
  assert.deepEqual(me.trips[made.id], { role: "admin", roles: [], owner: "Olle" });
  assert.equal((await call(app, `/api/trips/${made.id}/changes`, { method: "POST", cookie: eva.cookie, body: { baseRevision: 1, ops: [{ op: "set", path: "purpose", value: "x" }] } })).status, 200);
  assert.equal((await call(app, "/api/log", { cookie: eva.cookie })).status, 200);
});

// REQ: US-16 AI only for users the superuser allows
test("US-16 the AI service is offered only to users allowed AI", async () => {
  const store = memoryStore([trip("berlin")]);
  const app = createApp(store, tokens, { auth, aiService: true });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  await account(app, admin, "Eva", "eva@example.org");
  const olle = await account(app, admin, "Olle", "olle@example.org");
  assert.equal((await json(call(app, "/api/settings", { cookie: olle.cookie }))).aiService, false);
  await call(app, "/api/users/olle", { method: "PATCH", cookie: admin, body: { ai: true } });
  assert.equal((await json(call(app, "/api/settings", { cookie: olle.cookie }))).aiService, true);
  assert.equal((await json(call(app, "/api/settings", { cookie: admin }))).aiService, true);
});

// REQ: US-17 changes are logged with the user's name
test("US-17 a user's changes are logged with their name", async () => {
  const { app, admin, store } = await setup();
  const eva = await account(app, admin, "Eva", "eva@example.org");
  await call(app, "/api/trips/berlin/changes", { method: "POST", cookie: eva.cookie, body: { baseRevision: 1, ops: [{ op: "set", path: "purpose", value: "x" }] } });
  assert.equal((await store.log()).at(-1)?.actor, "Eva");
});

// REQ: US-18 the admin password stays as a fallback and acts as the first superuser
test("US-18 the admin password still works and its new trips belong to the first superuser", async () => {
  const { app, admin } = await setup();
  assert.deepEqual(await json(call(app, "/api/me", { cookie: admin })), { role: "admin" });
  const eva = await account(app, admin, "Eva", "eva@example.org");
  const made = await json(call(app, "/api/trips", { method: "POST", cookie: admin, body: { title: "Ny" } }));
  assert.deepEqual((await json(call(app, "/api/me", { cookie: eva.cookie }))).trips[made.id].roles, ["owner", "planner"]); // Eva, the first superuser, is also its first traveler (US-39)
});

/** Ties a traveler of a trip to an address, as the trip's settings do (US-21). */
const tie = (app: App, cookie: string, tripId: string, travelerId: string, account: string | null, role = "traveler") =>
  call(app, `/api/trips/${tripId}/people/${travelerId}`, { method: "PUT", cookie, body: { role, account } });

// REQ: US-21 an address per traveler, kept on the server with the personal link, only for managers
test("US-21 a manager ties a traveler to an address; it never enters the trip's data", async () => {
  const { app, admin, store } = await setup();
  const r = await json(tie(app, admin, "berlin", "anna", " Anna@Example.org "));
  assert.equal(r.account, "anna@example.org"); // saved although no account has it yet
  assert.equal((await tie(app, admin, "berlin", "bo", "anna@example.org")).status, 409); // the same address twice in one trip
  assert.equal((await tie(app, admin, "berlin", "bo", "inte-en-adress")).status, 400);
  assert.ok(!JSON.stringify(await store.load("berlin")).includes("anna@example.org"));
  const people = await json(call(app, "/api/trips/berlin/people", { cookie: admin }));
  assert.equal(people.find((p: { travelerId: string }) => p.travelerId === "anna").account, "anna@example.org");
  const cleared = await json(tie(app, admin, "berlin", "anna", null));
  assert.equal(cleared.account, undefined);
  const anna = (await store.personLinks()).find((l) => l.travelerId === "anna")!;
  const self = `person.berlin.anna.${anna.secret}`;
  assert.equal((await call(app, "/api/trips/berlin/people", { auth: self })).status, 403); // a Resenär never sees the addresses
});

// REQ: US-22 a tied account gets the trip with the traveler's permission and as that traveler
test("US-22 a user tied to a traveler gets the trip as that traveler, with its permission", async () => {
  const { app, admin, store } = await setup();
  await account(app, admin, "Eva", "eva@example.org");
  await tie(app, admin, "berlin", "anna", "anna@example.org"); // before the account exists
  const anna = await account(app, admin, "Anna", "anna@example.org");
  assert.deepEqual(await tripIds(app, anna.cookie), ["berlin"]);
  assert.deepEqual((await json(call(app, "/api/me", { cookie: anna.cookie }))).trips.berlin, { role: "traveler", roles: ["traveler"], travelerId: "anna" });
  const exp = { id: "e1", text: "Glass", category: "Mat", amount: 60, sharedBy: [], date: "2026-10-25", addedAt: "2026-10-25T12:00:00.000Z" };
  const r = await call(app, "/api/trips/berlin/changes", { method: "POST", cookie: anna.cookie, body: { baseRevision: 1, ops: [{ op: "add", path: "expenses/-", value: exp }] } });
  assert.equal(r.status, 200, await r.clone().text());
  const e = (await store.load("berlin"))!.expenses[0]!;
  assert.deepEqual([e.paidBy, e.addedBy, e.pending], ["anna", "anna", true]); // AU-13, MI-09
  assert.equal((await store.log()).at(-1)?.actor, "Anna"); // AU-15
  assert.equal((await call(app, "/api/trips/berlin/changes", { method: "POST", cookie: anna.cookie, body: { baseRevision: 2, ops: [{ op: "set", path: "purpose", value: "x" }] } })).status, 403);
  await tie(app, admin, "berlin", "anna", "anna@example.org", "planner");
  assert.equal((await call(app, "/api/trips/berlin/changes", { method: "POST", cookie: anna.cookie, body: { baseRevision: 2, ops: [{ op: "set", path: "purpose", value: "x" }] } })).status, 200);
  await tie(app, admin, "berlin", "anna", null);
  assert.deepEqual(await tripIds(app, anna.cookie), []); // untied: the trip is gone for her
});

// REQ: US-20 accounts are kept apart from the trips and the log
test("US-20 no address, hash or Google id reaches a trip or the log", async () => {
  const { app, admin, store } = await setup();
  const eva = await account(app, admin, "Eva", "eva@example.org");
  await call(app, "/api/trips/berlin/changes", { method: "POST", cookie: eva.cookie, body: { baseRevision: 1, ops: [{ op: "set", path: "purpose", value: "x" }] } });
  const all = JSON.stringify([await store.list(), await store.log()]);
  for (const s of ["eva@example.org", "pbkdf2"]) assert.ok(!all.includes(s), s);
});

