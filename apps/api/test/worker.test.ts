import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import worker from "../src/worker.ts";
import { d1Store } from "../src/d1-store.ts";
import { loadSql } from "../src/d1-load.ts";
import { memoryR2, sqliteD1 } from "./helpers/sqlite-d1.ts";

const trip = (id: string, title = id) => Trip.parse({
  id, revision: 3, title, timezone: "Europe/Berlin", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [],
});
const env = () => ({
  DB: sqliteD1(), IMAGES: memoryR2(), TRIP_ADMIN_TOKEN: "admin-token-1234", ADMIN_PASSWORD: "lösen-1234", SESSION_KEY: "k".repeat(32),
  ASSETS: { fetch: async (r: Request) => new Response(`asset ${new URL(r.url).pathname}`) },
});

test("DP-01 the Worker answers /api with the API and everything else with the web files", async () => {
  const e = env();
  const me = await worker.fetch(new Request("https://x.workers.dev/api/me", { headers: { authorization: "Bearer admin-token-1234" } }), e);
  assert.deepEqual(await me.json(), { role: "admin" });
  assert.equal(await (await worker.fetch(new Request("https://x.workers.dev/"), e)).text(), "asset /");
  assert.equal((await worker.fetch(new Request("https://x.workers.dev/api/trips"), e)).status, 401);
});

test("DP-07 the Worker reads its passwords and keys from its secrets", async () => {
  const e = env();
  const login = await worker.fetch(new Request("https://x.workers.dev/api/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "lösen-1234" }),
  }), e);
  assert.equal(login.status, 204);
  const off = { ...env(), ADMIN_PASSWORD: undefined };
  assert.equal((await worker.fetch(new Request("https://x.workers.dev/api/login", { method: "POST", body: "{}" }), off)).status, 404);
});

test("DP-10 trips, settings and links from a folder become SQL that loads into D1 and can be run again", async () => {
  const sql = loadSql({ trips: [trip("berlin", "O'Brien’s Berlin"), trip("skane")], settings: { ai: { enabled: true, areas: {} } }, links: { berlin: "s1" } });
  const db = sqliteD1();
  db.db.exec(sql);
  db.db.exec(sql); // running it twice changes nothing
  const s = d1Store(db, memoryR2());
  assert.deepEqual((await s.list()).map((t) => [t.id, t.title, t.revision]), [["berlin", "O'Brien’s Berlin", 3], ["skane", "skane", 3]]);
  assert.equal((await s.loadSettings()).ai.enabled, true);
  assert.deepEqual(await s.links(), { berlin: "s1" });
  assert.ok(!/BEGIN|COMMIT/i.test(sql)); // D1 runs a file without explicit transactions
});

test("DP-10 only the named trips are loaded, and only their links and images", async () => {
  const { pickTrips } = await import("../src/d1-load.ts");
  const trips = [trip("berlin"), trip("hostlov"), trip("skane")];
  assert.deepEqual(pickTrips(trips, ["hostlov"]).map((t) => t.id), ["hostlov"]);
  assert.deepEqual(pickTrips(trips, []).map((t) => t.id), ["berlin", "hostlov", "skane"]); // none named: all
  assert.throws(() => pickTrips(trips, ["nope"]), /nope/);
});

// REQ: DP-10 the settings are loaded only from a folder that has settings.json, so loading one trip keeps the instance's settings
test("DP-10 a folder without settings.json loads no settings", async () => {
  const { folderSettings } = await import("../src/d1-load.ts");
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "d1-load-"));
  assert.equal(await folderSettings(dir), undefined);
  assert.ok(!loadSql({ trips: [trip("berlin")], settings: await folderSettings(dir) }).includes("settings"));
  await writeFile(join(dir, "settings.json"), JSON.stringify({ ai: { enabled: true } }));
  assert.equal((await folderSettings(dir))?.ai.enabled, true);
});

// REQ: DP-02 unknown paths outside /api go to the web files, whose start page answers them (not_found_handling in wrangler.jsonc);
// unknown paths under /api stay API errors
test("DP-02 links into the app reach the web files, unknown API paths do not", async () => {
  const e = { ...env(), ASSETS: { fetch: async (r: Request) => new Response(new URL(r.url).pathname.includes(".") ? "file" : "start page") } };
  for (const p of ["/berlin", "/trip/berlin/nala", "/x/y/z?q=1"]) assert.equal(await (await worker.fetch(new Request(`https://x.workers.dev${p}`), e)).text(), "start page", p);
  const api = await worker.fetch(new Request("https://x.workers.dev/api/no-such-thing", { headers: { authorization: "Bearer admin-token-1234" } }), e);
  assert.equal(api.status, 404);
  assert.notEqual(await api.text(), "start page");
});
