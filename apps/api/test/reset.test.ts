import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import { brevoMailer, type Mail } from "../src/mailer.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, init: { method?: string; body?: unknown; cookie?: string; ip?: string } = {}) => app.request(path, {
  method: init.method ?? "GET",
  headers: { "content-type": "application/json", "cf-connecting-ip": init.ip ?? "203.0.113.1", ...(init.cookie ? { cookie: init.cookie } : {}) },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
});
const cookieOf = (r: Response) => (r.headers.getSetCookie().find((x) => x.startsWith("session=")) ?? "").split(";")[0]!;
const PW = "ett långt lösenord";
const settle = () => new Promise((r) => setTimeout(r, 30)); // the mail is sent after the answer

/** Eva with a password, a disabled account, and a mailer that keeps what it sends. */
async function setup(withMail = true) {
  const store = memoryStore([]), sent: Mail[] = [];
  let now = new Date("2026-11-03T10:00:00Z");
  const app = createApp(store, tokens, { auth, now: () => now, ...(withMail ? { mail: { send: async (m: Mail) => { sent.push(m); return true; }, appUrl: "https://resa.example.org" } } : {}) });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  const { user, setup: s } = await (await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Eva", email: "eva@example.org" } })).json();
  await call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: s.secret, password: PW } });
  const { user: off } = await (await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Off", email: "off@example.org" } })).json();
  await call(app, `/api/users/${off.id}`, { method: "PATCH", cookie: admin, body: { disabled: true } });
  const reset = (email: string, ip?: string) => call(app, "/api/reset", { method: "POST", body: { email }, ip });
  return { app, store, sent, reset, tick: (min: number) => { now = new Date(now.getTime() + min * 60_000); } };
}

// REQ: US-35 a forgotten password: the same answer for any address, a mail with a one-hour password link only to an account
test("US-35 a reset mail goes only to an account, and the answer never tells", async () => {
  const { app, sent, reset } = await setup();
  const known = await reset(" Eva@Example.org "), unknown = await reset("nobody@example.org"), disabled = await reset("off@example.org");
  for (const r of [known, unknown, disabled]) assert.equal(r.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());
  await settle();
  assert.equal(sent.length, 1);
  const m = sent[0]!;
  assert.equal(m.to, "eva@example.org");
  const link = /https:\/\/resa\.example\.org\/#u=([\w-]+)\.([\w-]+)/.exec(m.text);
  assert.ok(link, "the link uses the configured address, never the request's");
  assert.match(m.subject, /lösenord/i);
  assert.ok(m.html?.includes(link![0]));
  // the link sets a new password and logs in
  assert.equal((await call(app, "/api/setup", { method: "POST", body: { user: link![1], secret: link![2], password: "ett annat långt lösenord" } })).status, 204);
  assert.equal((await call(app, "/api/login", { method: "POST", body: { email: "eva@example.org", password: "ett annat långt lösenord" } })).status, 204);
  assert.equal((await call(app, "/api/login", { method: "POST", body: { email: "eva@example.org", password: PW } })).status, 401);
});

// REQ: US-35 the link is valid for one hour and replaces an earlier link
test("US-35 the reset link lasts an hour", async () => {
  const { app, sent, reset, tick } = await setup();
  await reset("eva@example.org"); await settle();
  const [, user, secret] = /#u=([\w-]+)\.([\w-]+)/.exec(sent[0]!.text)!;
  tick(61);
  assert.equal((await call(app, "/api/setup/info", { method: "POST", body: { user, secret } })).status, 410);
});

// REQ: US-35 at most one mail per account per 15 minutes and three per day, and 50 a day for the whole instance
test("US-35 reset mails are limited", async () => {
  const { sent, reset, tick, store } = await setup();
  await reset("eva@example.org"); await reset("eva@example.org"); await settle();
  assert.equal(sent.length, 1, "again at once: no mail");
  for (let i = 0; i < 3; i++) { tick(16); await reset("eva@example.org"); await settle(); }
  assert.equal(sent.length, 3, "three a day");
  tick(24 * 60); await reset("eva@example.org"); await settle();
  assert.equal(sent.length, 4, "a new day");
  // the whole instance: 50 a day, Eva's last one included
  for (let i = 0; i < 52; i++) await store.saveUser({ id: `u${i}`, name: `U${i}`, email: `u${i}@example.org`, superuser: false, disabled: false, ai: false, createdAt: "2026-11-01T00:00:00Z", passwordHash: "x" });
  for (let i = 0; i < 52; i++) { await reset(`u${i}@example.org`, `198.51.100.${i}`); await settle(); }
  assert.equal(sent.length, 4 + 49);
});

// REQ: US-35 without a mail service the server says so, and the login page explains how to get in again as before
test("US-35 no mail service", async () => {
  const { app, reset } = await setup(false);
  assert.equal((await reset("eva@example.org")).status, 404);
  assert.deepEqual(await (await call(app, "/api/auth/config")).json(), { google: false }, "unchanged without a mail service");
  const on = await setup();
  assert.deepEqual(await (await call(on.app, "/api/auth/config")).json(), { google: false, reset: true });
});

// REQ: US-35 the mail goes through Brevo's API with the key as a header, and a failure is no exception
test("US-35 Brevo mailer", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const ok = brevoMailer({ apiKey: "nyckel", from: "Baslager <noreply@resa.example.org>" }, (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response("{}", { status: 201 }); }) as typeof fetch);
  assert.equal(await ok.send({ to: "eva@example.org", name: "Eva", subject: "Ämne", text: "Text", html: "<p>Text</p>" }), true);
  assert.equal(seen[0]!.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal((seen[0]!.init.headers as Record<string, string>)["api-key"], "nyckel");
  assert.deepEqual(JSON.parse(String(seen[0]!.init.body)), {
    sender: { name: "Baslager", email: "noreply@resa.example.org" }, to: [{ email: "eva@example.org", name: "Eva" }],
    subject: "Ämne", textContent: "Text", htmlContent: "<p>Text</p>",
  });
  const bad = brevoMailer({ apiKey: "x", from: "noreply@resa.example.org" }, (async () => new Response("no", { status: 401 })) as unknown as typeof fetch);
  assert.equal(await bad.send({ to: "a@example.org", name: "A", subject: "s", text: "t" }), false);
  const down = brevoMailer({ apiKey: "x", from: "noreply@resa.example.org" }, (async () => { throw new Error("net"); }) as unknown as typeof fetch);
  assert.equal(await down.send({ to: "a@example.org", name: "A", subject: "s", text: "t" }), false);
});
