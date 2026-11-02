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

async function setup() {
  const store = memoryStore([]);
  const app = createApp(store, tokens, { auth, now: () => new Date("2026-11-02T10:00:00Z") });
  const admin = cookieOf(await call(app, "/api/login", { method: "POST", body: { password: auth.adminPassword } }));
  const make = async (name: string, email: string) => {
    const { user, setup: s } = await json(call(app, "/api/users", { method: "POST", cookie: admin, body: { name, email } }));
    return cookieOf(await call(app, "/api/setup", { method: "POST", body: { user: user.id, secret: s.secret, password: "ett långt lösenord", consent: true } }));
  };
  const eva = await make("Eva", "eva@example.org"), olle = await make("Olle", "olle@example.org"), kim = await make("Kim", "kim@example.org");
  await call(app, "/api/feedback", { method: "POST", cookie: olle, body: { text: "Var är budgeten?", page: "nala" } });
  await call(app, "/api/feedback", { method: "POST", cookie: kim, body: { text: "Fin app", page: "up" } });
  const notes = await json(call(app, "/api/feedback", { cookie: eva }));
  return { app, eva, olle, kim, olleNote: notes.find((n: { name: string }) => n.name === "Olle").id as string };
}

// REQ: US-34 the superuser answers a note; only the writer sees it with the answer
test("US-34 the superuser answers; the writer sees their own notes with the answer", async () => {
  const { app, eva, olle, kim, olleNote } = await setup();
  const reply = (cookie: string, text: string) => call(app, `/api/feedback/${olleNote}/reply`, { method: "PUT", cookie, body: { text } });
  assert.equal((await reply(olle, "Jag svarar själv")).status, 403);
  assert.equal((await reply(eva, "x".repeat(1001))).status, 400);
  assert.equal((await reply(eva, "Under Pengar i Minnas. Tack!")).status, 200);
  const mine = await json(call(app, "/api/feedback/mine", { cookie: olle }));
  assert.deepEqual(mine.map((n: { text: string; reply?: string; replyAt?: string }) => [n.text, n.reply, n.replyAt]),
    [["Var är budgeten?", "Under Pengar i Minnas. Tack!", "2026-11-02T10:00:00.000Z"]]);
  const kims = await json(call(app, "/api/feedback/mine", { cookie: kim }));
  assert.deepEqual(kims.map((n: { text: string; reply?: string }) => [n.text, n.reply]), [["Fin app", undefined]]); // nobody else's
  assert.equal((await call(app, "/api/feedback/mine")).status, 401); // no login
  assert.equal((await call(app, `/api/feedback/nope/reply`, { method: "PUT", cookie: eva, body: { text: "x" } })).status, 404);
});

// REQ: US-34 an answer can be changed or cleared
test("US-34 clearing the answer removes it", async () => {
  const { app, eva, olle, olleNote } = await setup();
  await call(app, `/api/feedback/${olleNote}/reply`, { method: "PUT", cookie: eva, body: { text: "Svar" } });
  await call(app, `/api/feedback/${olleNote}/reply`, { method: "PUT", cookie: eva, body: { text: "  " } });
  const [n] = await json(call(app, "/api/feedback/mine", { cookie: olle }));
  assert.equal(n.reply, undefined);
  assert.equal((await json(call(app, "/api/feedback", { cookie: eva }))).length, 2); // still both notes, not doubled
});
