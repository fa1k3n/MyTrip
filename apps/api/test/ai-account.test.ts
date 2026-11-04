import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
const PW = "ett långt lösenord";
const call = (app: ReturnType<typeof createApp>, path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) => app.request(path, {
  method: init.method ?? "GET",
  headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.1", ...(init.cookie ? { cookie: init.cookie } : {}) },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
});
const cookieOf = (r: Response) => (r.headers.getSetCookie().find((x) => x.startsWith("session=")) ?? "").split(";")[0]!;

// REQ: AI-99 the settings answer says when the account (not the instance) is not allowed AI
test("AI-99 the settings answer says aiAccount false only for an account without AI", async () => {
  const app = createApp(memoryStore(), tokens, { auth, aiService: true });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Eva", email: "eva@example.org" } }); // the first account is the superuser
  const r = await call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Olle", email: "olle@example.org" } });
  const { user, setup } = await r.json();
  const olle = cookieOf(await call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: setup.secret, password: PW } }));
  const s = async (cookie: string) => (await call(app, "/api/settings", { cookie })).json();
  assert.deepEqual([(await s(olle)).aiService, (await s(olle)).aiAccount], [false, false]);
  assert.equal((await s(admin)).aiAccount, undefined);
  await call(app, `/api/users/${user.id}`, { method: "PATCH", cookie: admin, body: { ai: true } });
  assert.equal((await s(olle)).aiAccount, undefined);
  // an instance without a service is not an account fault
  const bare = createApp(memoryStore(), tokens, { auth });
  assert.equal((await (await call(bare, "/api/settings", { cookie: cookieOf(await call(bare, "/api/login", { method: "POST", body: { password: auth.adminPassword } })) })).json()).aiAccount, undefined);
});
