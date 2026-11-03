import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) => app.request(path, {
  method: init.method ?? "GET", headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const cookieOf = (r: Response) => (r.headers.getSetCookie().find((x) => x.startsWith("session=")) ?? "").split(";")[0]!;

// REQ: US-38 a beta note is kept with the app's version it was written in, shown to the superuser; anything that is no version is left out
test("US-38 notes carry the version", async () => {
  const app = createApp(memoryStore([]), tokens, { auth, now: () => new Date("2026-11-03T10:00:00Z") });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  const { user, setup: s } = await json(call(app, "/api/users", { method: "POST", cookie: admin, body: { name: "Olle", email: "olle@example.org" } }));
  const olle = cookieOf(await call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: s.secret, password: "ett långt lösenord", consent: true } }));
  await call(app, "/api/feedback", { method: "POST", cookie: olle, body: { text: "Fin app", page: "up", version: "0.2.0" } });
  await call(app, "/api/feedback", { method: "POST", cookie: olle, body: { text: "Hej", page: "up", version: "<script>" } });
  const notes = await json(call(app, "/api/feedback", { cookie: admin }));
  assert.deepEqual(notes.map((n: { text: string; version?: string }) => [n.text, n.version]), [["Fin app", "0.2.0"], ["Hej", undefined]]);
});
