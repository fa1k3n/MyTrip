import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore, type Store } from "../src/app.ts";
import { hashPassword, publicUser, totpCode, TOTP_STEP_MS, type User } from "../src/users.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const google = { clientId: "klient.apps.example", clientSecret: "g-hemlis" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32), google, secondFactor: true };
const PW = "ett långt lösenord";
const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"; // fictional, base32
const START = Date.parse("2026-11-04T10:00:10Z");

type App = ReturnType<typeof createApp>;
type Init = { method?: string; body?: unknown; cookie?: string; ip?: string };
const call = (app: App, path: string, init: Init = {}) => app.request(path, {
  method: init.method ?? "GET",
  headers: { "content-type": "application/json", "cf-connecting-ip": init.ip ?? "203.0.113.1", ...(init.cookie ? { cookie: init.cookie } : {}) },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
});
/** The cookie of that name a response sets, as `name=value`, or "". */
const cookie = (r: Response, name: string) => (r.headers.getSetCookie().find((x) => x.startsWith(`${name}=`) && !x.includes("Max-Age=0")) ?? "").split(";")[0]!;

async function person(store: Store, id: string, superuser: boolean, extra: Partial<User> = {}) {
  const u: User = { id, name: id[0]!.toUpperCase() + id.slice(1), email: `${id}@example.org`, superuser, disabled: false, ai: false,
    createdAt: `2026-11-0${superuser ? 1 : 2}T00:00:00.000Z`, passwordHash: await hashPassword(PW), ...extra };
  await store.saveUser(u);
  return u;
}
function setup(opts: { fetch?: typeof fetch; secondFactor?: boolean } = {}) {
  const store = memoryStore([]);
  const clock = { now: START };
  const app = createApp(store, tokens, { auth: { ...auth, secondFactor: opts.secondFactor ?? true }, now: () => new Date(clock.now), fetch: opts.fetch });
  return { store, app, clock };
}
const step = (ms: number) => Math.floor(ms / TOTP_STEP_MS);
const passwordStep = (app: App, email: string, ip?: string) => call(app, "/api/login", { method: "POST", body: { email, password: PW }, ip });
const codeStep = (app: App, mfa: string, code: string, ip?: string) => call(app, "/api/login/code", { method: "POST", body: { code }, cookie: mfa, ip });
const me = (app: App, session: string) => call(app, "/api/me", { cookie: session });

// REQ: SP-13 TOTP as RFC 6238 (HMAC-SHA1, 30 s, 6 digits)
test("SP-13 the one-time code follows RFC 6238", async () => {
  const rfc = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890"
  assert.equal(await totpCode(rfc, step(59_000)), "287082");
  assert.equal(await totpCode(rfc, step(1_111_111_109_000)), "081804");
  assert.equal(await totpCode(rfc, step(2_000_000_000_000)), "279037");
});

// REQ: SP-13 a superuser without the code gets no session
test("SP-13 a superuser's password alone gives no session, only the code step", async () => {
  const { app, store } = setup();
  await person(store, "eva", true, { totp: { secret: SECRET } });
  const r = await passwordStep(app, "eva@example.org");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { second: "code" });
  assert.equal(cookie(r, "session"), "", "no session before the code");
  const mfa = cookie(r, "mfa");
  assert.ok(mfa, "a short-lived cookie for the code step");
  assert.ok(r.headers.getSetCookie().find((x) => x.startsWith("mfa="))!.match(/HttpOnly.*Secure|Secure.*HttpOnly/), "HttpOnly and Secure");
  assert.equal((await me(app, mfa)).status, 401, "the code-step cookie is no session");
  assert.equal((await codeStep(app, mfa, "000000")).status, 401);
  assert.equal((await codeStep(app, "", await totpCode(SECRET, step(START)))).status, 401, "no code step without the password first");
});

// REQ: SP-13 a right code within ±1 step works once, never again
test("SP-13 a code from the step before, now or after works, and only once", async () => {
  const { app, store, clock } = setup();
  await person(store, "eva", true, { totp: { secret: SECRET } });
  const login = async (code: string) => codeStep(app, cookie(await passwordStep(app, "eva@example.org"), "mfa"), code);
  const before = await login(await totpCode(SECRET, step(START) - 1));
  assert.equal(before.status, 204, "the step before is accepted (clock drift)");
  const session = cookie(before, "session");
  assert.equal((await (await me(app, session)).json()).user.superuser, true);
  assert.equal((await login(await totpCode(SECRET, step(START) - 1))).status, 401, "the same code again is refused");
  assert.equal((await login(await totpCode(SECRET, step(START) - 2))).status, 401, "two steps back is too old");
  assert.equal((await login(await totpCode(SECRET, step(START) + 1))).status, 204, "the step after is accepted");
  assert.equal((await login(await totpCode(SECRET, step(START)))).status, 401, "a step older than the last used one is refused");
  clock.now += 2 * TOTP_STEP_MS;
  assert.equal((await login(await totpCode(SECRET, step(clock.now)))).status, 204);
  clock.now += 6 * 60_000;
  const late = cookie(await passwordStep(app, "eva@example.org"), "mfa");
  clock.now += 6 * 60_000; // the code step lasts five minutes
  assert.equal((await codeStep(app, late, await totpCode(SECRET, step(clock.now)))).status, 401);
});

// REQ: SP-13 a recovery code works once
test("SP-13 a recovery code replaces the one-time code once", async () => {
  const { app, store } = setup();
  const r = await passwordStep(app, "nils@example.org");
  assert.equal(r.status, 401, "no account yet");
  await person(store, "nils", true);
  const first = await passwordStep(app, "nils@example.org");
  assert.deepEqual(await first.json(), { second: "enroll" });
  const mfa = cookie(first, "mfa");
  const enroll = await call(app, "/api/login/enroll", { method: "POST", cookie: mfa });
  assert.equal(enroll.status, 200);
  const { secret, uri } = await enroll.json() as { secret: string; uri: string };
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.ok(uri.startsWith("otpauth://totp/") && uri.includes(`secret=${secret}`) && uri.includes("nils%40example.org"), uri);
  assert.equal(cookie(enroll, "session"), "");
  assert.equal((await codeStep(app, mfa, "123456")).status, 401, "a wrong first code does not turn it on");
  const done = await codeStep(app, mfa, await totpCode(secret, step(START)));
  assert.equal(done.status, 200);
  const { recovery } = await done.json() as { recovery: string[] };
  assert.equal(recovery.length, 10);
  assert.equal(new Set(recovery).size, 10);
  assert.ok(cookie(done, "session"), "turning it on also logs in");
  const kept = JSON.stringify(await store.users());
  assert.ok(recovery.every((x) => !kept.includes(x)), "only hashes of the recovery codes are kept");
  assert.equal(JSON.stringify(publicUser((await store.users()).find((u) => u.id === "nils")!)).includes(secret), false, "the list of accounts never shows the secret");
  assert.equal((await call(app, "/api/login/enroll", { method: "POST", cookie: cookie(await passwordStep(app, "nils@example.org"), "mfa") })).status, 409, "turned on once");

  const use = async (code: string) => codeStep(app, cookie(await passwordStep(app, "nils@example.org"), "mfa"), code);
  const spent = await use(` ${recovery[3]!.toUpperCase()} `);
  assert.equal(spent.status, 200);
  assert.deepEqual(await spent.json(), { left: 9 });
  assert.ok(cookie(spent, "session"));
  assert.equal((await use(recovery[3]!)).status, 401, "a recovery code works once");
  assert.equal((await use(recovery[4]!.replace("-", ""))).status, 200, "the dash is optional");
});

// REQ: SP-13 ordinary accounts are unchanged
test("SP-13 an account without the superuser flag logs in with the password alone", async () => {
  const { app, store } = setup();
  await person(store, "eva", true, { totp: { secret: SECRET } });
  await person(store, "olle", false);
  const r = await passwordStep(app, "olle@example.org");
  assert.equal(r.status, 204);
  assert.equal(cookie(r, "mfa"), "");
  assert.equal((await (await me(app, cookie(r, "session"))).json()).user.superuser, false);
});

// REQ: SP-13 SP-11 failed codes count as failed logins
test("SP-13 SP-11 five wrong codes block the account, and the password does not reset the count", async () => {
  const { app, store, clock } = setup();
  await person(store, "eva", true, { totp: { secret: SECRET } });
  for (let i = 0; i < 5; i++) {
    const mfa = cookie(await passwordStep(app, "eva@example.org", `198.51.100.${i + 1}`), "mfa");
    assert.ok(mfa, `the password step ${i + 1} still opens the code step`);
    assert.equal((await codeStep(app, mfa, "000000", `198.51.100.${i + 1}`)).status, 401);
  }
  assert.equal((await passwordStep(app, "eva@example.org", "198.51.100.50")).status, 429, "the account is blocked from any address");
  clock.now += 15 * 60_000 + 1000;
  const mfa = cookie(await passwordStep(app, "eva@example.org", "198.51.100.60"), "mfa");
  assert.equal((await codeStep(app, mfa, await totpCode(SECRET, step(clock.now)), "198.51.100.60")).status, 204, "after the window it works");
});

// REQ: SP-13 the admin password asks for the first superuser's code
test("SP-13 US-18 the admin password needs the first superuser's code once a superuser exists", async () => {
  const { app, store } = setup();
  const admin = () => call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } });
  const bare = await admin();
  assert.equal(bare.status, 204, "a new instance without superusers lets the password in, to create the first account");
  const early = cookie(bare, "session");
  assert.equal((await call(app, "/api/users", { cookie: early })).status, 200);
  await person(store, "eva", true);
  assert.equal((await admin()).status, 403, "a superuser without a second factor must log in with the account first");
  assert.equal((await call(app, "/api/users", { cookie: early })).status, 401, "a session without the code ends once a superuser exists");
  await store.saveUser({ ...(await store.users())[0]!, totp: { secret: SECRET } });
  const r = await admin();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { second: "code" });
  assert.equal(cookie(r, "session"), "");
  const done = await codeStep(app, cookie(r, "mfa"), await totpCode(SECRET, step(START)));
  assert.equal(done.status, 204);
  assert.equal((await call(app, "/api/users", { cookie: cookie(done, "session") })).status, 200);
});

// REQ: SP-13 sessions made without the code do not count for a superuser
test("SP-13 a superuser session made without the second factor is refused", async () => {
  const { app, store } = setup();
  const old = createApp(store, tokens, { auth: { ...auth, secondFactor: false }, now: () => new Date(START) });
  await person(store, "eva", true, { totp: { secret: SECRET } });
  await person(store, "olle", false);
  const eva = await passwordStep(old, "eva@example.org");
  assert.equal(eva.status, 204);
  assert.equal((await me(app, cookie(eva, "session"))).status, 401);
  const olle = await passwordStep(old, "olle@example.org");
  assert.equal((await me(app, cookie(olle, "session"))).status, 200, "ordinary sessions keep working");
});

// REQ: SP-13 Google login and the password link also lead to the code step for a superuser
test("SP-13 Google login and a password link give a superuser the code step, not a session", async () => {
  const fakeFetch = (async () => {
    const payload = btoa(JSON.stringify({ iss: "https://accounts.google.com", aud: google.clientId, exp: Math.floor(START / 1000) + 600, sub: "g-eva", email: "eva@example.org", email_verified: true })).replace(/=+$/, "");
    return new Response(JSON.stringify({ id_token: `e30.${payload}.sig` }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const { app, store } = setup({ fetch: fakeFetch });
  await person(store, "eva", true, { totp: { secret: SECRET } });
  const start = await call(app, "/api/auth/google");
  const state = new URL(start.headers.get("location")!).searchParams.get("state");
  const back = await call(app, `/api/auth/google/callback?code=kod&state=${state}`, { cookie: cookie(start, "google") });
  assert.equal(back.status, 302);
  assert.equal(back.headers.get("location"), "/#login=kod");
  assert.equal(cookie(back, "session"), "");
  const done = await codeStep(app, cookie(back, "mfa"), await totpCode(SECRET, step(START)));
  assert.equal(done.status, 204);
  assert.equal((await (await me(app, cookie(done, "session"))).json()).user.id, "eva");

  const secret = "lankhemlighet";
  await store.saveUser({ ...(await store.users()).find((u) => u.id === "eva")!, setup: { hash: await (await import("../src/users.ts")).sha256(secret), expires: "2026-11-10T00:00:00.000Z" } });
  const set = await call(app, "/api/setup", { method: "POST", body: { user: "eva", secret, password: "ett nytt långt lösenord" } });
  assert.equal(set.status, 200);
  assert.deepEqual(await set.json(), { second: "code" });
  assert.equal(cookie(set, "session"), "", "a new password is no way around the code");
  assert.equal((await codeStep(app, cookie(set, "mfa"), await totpCode(SECRET, step(START) + 1))).status, 204);
});

// REQ: SP-13 without the setting, createApp keeps the one-step login (the Worker and the Node server turn it on)
test("SP-13 the second step is on only when the server turns it on", async () => {
  const { app, store } = setup({ secondFactor: false });
  await person(store, "eva", true, { totp: { secret: SECRET } });
  assert.equal((await passwordStep(app, "eva@example.org")).status, 204);
});
