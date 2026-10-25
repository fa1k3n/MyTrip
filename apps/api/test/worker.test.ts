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
