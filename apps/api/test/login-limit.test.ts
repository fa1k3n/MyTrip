import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, memoryStore, type Store } from "../src/app.ts";
import { fileStore } from "../src/file-store.ts";
import { d1Store } from "../src/d1-store.ts";
import { sqliteD1 } from "./helpers/sqlite-d1.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const auth = { adminPassword: "hemligt-lösen", sessionKey: "k".repeat(32) };
const stores: [string, () => Promise<Store>][] = [
  ["memory", async () => memoryStore([])],
  ["file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trip-fails-"));
    test.after(() => rm(dir, { recursive: true, force: true }));
    return fileStore(dir);
  }],
  ["d1", async () => d1Store(sqliteD1())],
];

for (const [name, make] of stores) {
  // REQ: SP-11 failures are counted in the store, so every server instance sees them
  test(`SP-11 ${name} store counts failures inside the window and clears them`, async () => {
    const s = await make();
    await s.addFail("ip:1", 1_000);
    await s.addFail("ip:1", 2_000);
    await s.addFail("ip:2", 2_000);
    assert.equal(await s.failCount("ip:1", 0), 2);
    assert.equal(await s.failCount("ip:1", 1_500), 1, "older failures do not count");
    assert.equal(await s.failCount("ip:2", 0), 1);
    await s.clearFails("ip:1");
    assert.equal(await s.failCount("ip:1", 0), 0);
    assert.equal(await s.failCount("ip:2", 0), 1);
  });

  test(`SP-11 ${name} two app instances over one store add their failures up and block`, async () => {
    const store = await make();
    let now = Date.parse("2026-11-04T10:00:00Z");
    const mk = () => createApp(store, tokens, { auth, now: () => new Date(now) });
    const [a, b] = [mk(), mk()];
    const login = (app: ReturnType<typeof mk>, password: string) =>
      app.request("/api/login", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.7" }, body: JSON.stringify({ password }) });
    for (let i = 0; i < 3; i++) assert.equal((await login(a, "fel")).status, 401);
    for (let i = 0; i < 2; i++) assert.equal((await login(b, "fel")).status, 401);
    assert.equal((await login(a, auth.adminPassword)).status, 429, "the fifth failure was on the other instance");
    assert.equal((await login(b, auth.adminPassword)).status, 429);
    now += 15 * 60_000 + 1000; // the block ends after its time
    assert.equal((await login(b, auth.adminPassword)).status, 204);
    for (let i = 0; i < 4; i++) await login(a, "fel");
    assert.equal((await login(b, auth.adminPassword)).status, 204, "a good login clears the count");
    for (let i = 0; i < 4; i++) assert.equal((await login(a, "fel")).status, 401);
  });
}
