import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Trip } from "@trip/schema";
import { createApp, memoryStore, type Store } from "../src/app.ts";
import { fileStore } from "../src/file-store.ts";
import { d1Store } from "../src/d1-store.ts";
import { loadSql } from "../src/d1-load.ts";
import { memoryR2, sqliteD1 } from "./helpers/sqlite-d1.ts";

const trip = (id: string, revision = 1) => Trip.parse({
  id, revision, title: id, timezone: "Europe/Berlin", image: `${id}.jpg`, stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [],
});
const jpg = new Uint8Array([0xff, 0xd8, 0xff]);

// The same checks run against every store (DP-06).
const stores: [string, () => Promise<Store>][] = [
  ["memory", async () => memoryStore([], { "berlin.jpg": jpg })],
  ["file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trip-store-"));
    await mkdir(join(dir, "img"));
    await writeFile(join(dir, "img", "berlin.jpg"), jpg);
    test.after(() => rm(dir, { recursive: true, force: true }));
    return fileStore(dir);
  }],
  ["d1", async () => { // images in D1 (DP-05)
    const db = sqliteD1();
    db.db.exec(loadSql({ trips: [], images: [{ name: "berlin.jpg", bytes: jpg }] }));
    return d1Store(db);
  }],
  ["d1 with R2", async () => d1Store(sqliteD1(), memoryR2({ "berlin.jpg": jpg }))],
];

for (const [name, make] of stores) {
  test(`DP-06 ${name} store saves, lists, loads and removes trips`, async () => {
    const s = await make();
    assert.equal(await s.save(trip("skane")), true);
    assert.equal(await s.save(trip("berlin")), true);
    assert.deepEqual((await s.list()).map((t) => t.id), ["berlin", "skane"]);
    assert.equal((await s.load("berlin"))?.title, "berlin");
    assert.equal(await s.load("nope"), undefined);
    assert.equal(await s.remove("berlin"), true);
    assert.equal(await s.remove("berlin"), false);
    assert.deepEqual((await s.list()).map((t) => t.id), ["skane"]);
  });

  test(`DP-03 ${name} store saves a change only on the revision it is based on`, async () => {
    const s = await make();
    await s.save(trip("berlin"));
    assert.equal(await s.save({ ...trip("berlin", 2), title: "first" }, 1), true);
    assert.equal(await s.save({ ...trip("berlin", 2), title: "second" }, 1), false); // someone else came first
    assert.equal((await s.load("berlin"))?.title, "first");
    const both = await Promise.all([3, 3].map((r, i) => s.save({ ...trip("berlin", r), title: `race ${i}` }, 2)));
    assert.deepEqual(both.filter(Boolean).length, 1);
  });

  test(`DP-04 ${name} store keeps proposals and the change log`, async () => {
    const s = await make();
    const p = { id: "p1", tripId: "berlin", baseRevision: 1, ops: [], reason: "r", status: "pending" as const, at: "2026-10-25T10:00:00Z" };
    await s.saveProposal(p);
    await s.saveProposal({ ...p, id: "p2", tripId: "skane" });
    await s.saveProposal({ ...p, status: "approved" });
    assert.deepEqual(await s.proposals("berlin"), [{ ...p, status: "approved" }]);
    await s.appendLog({ at: "2026-10-25T10:00:00Z", tripId: "berlin", actor: "user", reason: "a", ops: [] });
    await s.appendLog({ at: "2026-10-25T10:01:00Z", tripId: "berlin", actor: "link", reason: "b", ops: [] });
    assert.deepEqual((await s.log()).map((e) => e.reason), ["a", "b"]);
  });

  test(`AU-11 ${name} store keeps personal links`, async () => {
    const s = await make();
    assert.deepEqual(await s.personLinks(), []);
    const l = [{ tripId: "berlin", travelerId: "anna", secret: "s1", role: "planner" as const }, { tripId: "berlin", travelerId: "bo", secret: "s2", role: "traveler" as const }];
    await s.savePersonLinks(l);
    assert.deepEqual(await s.personLinks(), l);
    await s.savePersonLinks([l[1]]);
    assert.deepEqual(await s.personLinks(), [l[1]]);
  });

  test(`DP-06 ${name} store keeps settings, links and images`, async () => {
    const s = await make();
    assert.equal((await s.loadSettings()).ai.enabled, false);
    await s.saveSettings({ ai: { enabled: true, areas: {} } });
    assert.equal((await s.loadSettings()).ai.enabled, true);
    assert.deepEqual(await s.links(), {});
    await s.saveLinks({ berlin: "s1", skane: "s2" });
    await s.saveLinks({ berlin: "s3" });
    assert.deepEqual(await s.links(), { berlin: "s3" });
    assert.deepEqual(await s.image("berlin.jpg"), jpg);
    assert.equal(await s.image("nope.jpg"), undefined);
  });
}

test("DP-03 two changes on the same revision at the same time: one is saved, the other gets a conflict", async () => {
  const store = d1Store(sqliteD1(), memoryR2());
  await store.save(trip("berlin"));
  const app = createApp(store, { read: "r", propose: "p", admin: "a" });
  const change = (title: string) => app.request("/api/trips/berlin/changes", {
    method: "POST", headers: { authorization: "Bearer a", "content-type": "application/json" },
    body: JSON.stringify({ baseRevision: 1, ops: [{ op: "set", path: "title", value: title }], reason: "race" }),
  });
  const codes = (await Promise.all([change("A"), change("B")])).map((r) => r.status).sort();
  assert.deepEqual(codes, [200, 409]);
  assert.equal((await store.load("berlin"))?.revision, 2);
});

test("DP-04 proposals and the log survive a new app on the same store", async () => {
  const store = d1Store(sqliteD1(), memoryR2());
  await store.save(trip("berlin"));
  const tokens = { read: "r", propose: "p", admin: "a" };
  const first = createApp(store, tokens);
  const r = await first.request("/api/trips/berlin/changes", {
    method: "POST", headers: { authorization: "Bearer p", "content-type": "application/json" },
    body: JSON.stringify({ baseRevision: 1, ops: [{ op: "set", path: "title", value: "Nytt" }], reason: "llm" }),
  });
  const { proposalId } = await r.json();
  const second = createApp(store, tokens); // as after a restart of the Worker
  const ok = await second.request(`/api/trips/berlin/proposals/${proposalId}/approve`, { method: "POST", headers: { authorization: "Bearer a" } });
  assert.equal((await ok.json()).proposal.status, "approved");
  const log = await (await second.request("/api/log", { headers: { authorization: "Bearer a" } })).json();
  assert.deepEqual(log.map((e: { actor: string }) => e.actor), ["llm"]);
});

test("DP-05 a cover image larger than one SQL statement is stored in parts and comes back whole", async () => {
  const big = Uint8Array.from({ length: 150_000 }, (_, i) => (i * 7) % 256);
  const sql = loadSql({ trips: [], images: [{ name: "big.jpg", bytes: big }] });
  assert.ok(sql.split("\n").every((line) => line.length < 100_000), "every statement is under D1's 100 KB limit");
  const db = sqliteD1();
  db.db.exec(sql);
  db.db.exec(loadSql({ trips: [], images: [{ name: "big.jpg", bytes: big.slice(0, 50_000) }] })); // a smaller replacement drops the old extra parts
  assert.deepEqual(await d1Store(db).image("big.jpg"), big.slice(0, 50_000));
});

for (const [name, make] of stores) {
  // REQ: NT-03 every store keeps the push subscriptions per trip, and removes them by endpoint or person
  test(`NT-03 ${name} store keeps push subscriptions`, async () => {
    const s = await make();
    const sub = (who: string, endpoint: string, tripId = "berlin") => ({ tripId, who, endpoint, p256dh: "p", auth: "a" });
    await s.savePushSub(sub("anna", "https://push.example.com/1"));
    await s.savePushSub(sub("bo", "https://push.example.com/2"));
    await s.savePushSub(sub("anna", "https://push.example.com/1", "skane"));
    await s.savePushSub({ ...sub("anna", "https://push.example.com/1"), auth: "new" }); // the same phone again
    assert.deepEqual((await s.pushSubs("berlin")).map((x) => [x.who, x.endpoint, x.auth]), [["anna", "https://push.example.com/1", "new"], ["bo", "https://push.example.com/2", "a"]]);
    await s.removePushSubs("berlin", { who: "anna" });
    assert.deepEqual((await s.pushSubs("berlin")).map((x) => x.who), ["bo"]);
    await s.removePushSubs("berlin", { endpoint: "https://push.example.com/2" });
    assert.deepEqual(await s.pushSubs("berlin"), []);
    assert.equal((await s.pushSubs("skane")).length, 1, "other trips keep theirs");
  });
}
