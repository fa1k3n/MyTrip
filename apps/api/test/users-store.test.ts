import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryStore, type Store, type User } from "../src/app.ts";
import { fileStore } from "../src/file-store.ts";
import { d1Store } from "../src/d1-store.ts";
import { sqliteD1 } from "./helpers/sqlite-d1.ts";

const stores: [string, () => Promise<Store>][] = [
  ["memory", async () => memoryStore([])],
  ["file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trip-users-"));
    test.after(() => rm(dir, { recursive: true, force: true }));
    return fileStore(dir);
  }],
  ["d1", async () => d1Store(sqliteD1())],
];
const eva: User = { id: "eva", name: "Eva", email: "eva@example.org", superuser: true, disabled: false, ai: false, createdAt: "2026-11-01T12:00:00.000Z" };

for (const [name, make] of stores) {
  // REQ: US-01 US-20 accounts, trip owners and tied addresses are kept in every store
  test(`US-01 US-13 US-21 ${name} store keeps accounts, owners and the address of a personal link`, async () => {
    const s = await make();
    await s.saveUser(eva);
    await s.saveUser({ ...eva, id: "olle", name: "Olle", email: "olle@example.org", superuser: false, passwordHash: "pbkdf2-sha256$1$a$b", setup: { hash: "h", expires: "2026-11-08T12:00:00.000Z" } });
    await s.saveUser({ ...eva, name: "Eva E", lastLogin: "2026-11-02T08:00:00.000Z", googleId: "g-1" });
    const users = await s.users();
    assert.deepEqual(users.map((u) => u.id), ["eva", "olle"]);
    assert.deepEqual(users[0], { ...eva, name: "Eva E", lastLogin: "2026-11-02T08:00:00.000Z", googleId: "g-1" });
    assert.equal(users[1]!.setup?.hash, "h");
    await s.removeUser("olle");
    assert.deepEqual((await s.users()).map((u) => u.id), ["eva"]);
    await s.saveOwner("berlin", "eva");
    await s.saveOwner("skane", "eva");
    await s.saveOwner("skane", null);
    assert.deepEqual(await s.owners(), { berlin: "eva" });
    await s.savePersonLinks([{ tripId: "berlin", travelerId: "anna", secret: "x", role: "traveler", account: "anna@example.org" }, { tripId: "berlin", travelerId: "bo", secret: "y", role: "planner" }]);
    assert.deepEqual(await s.personLinks(), [{ tripId: "berlin", travelerId: "anna", secret: "x", role: "traveler", account: "anna@example.org" }, { tripId: "berlin", travelerId: "bo", secret: "y", role: "planner" }]);
  });
}

for (const [name, make] of stores) {
  // REQ: US-27 US-28 feedback and page opens are kept in every store; a page open once per person, page and day
  test(`US-27 US-28 ${name} store keeps feedback and page opens`, async () => {
    const s = await make();
    await s.saveFeedback({ id: "f1", at: "2026-11-02T08:00:00.000Z", who: "olle", name: "Olle", text: "Bra!", page: "up", tripId: "berlin" });
    assert.deepEqual(await s.feedback(), [{ id: "f1", at: "2026-11-02T08:00:00.000Z", who: "olle", name: "Olle", text: "Bra!", page: "up", tripId: "berlin" }]);
    const u = { tripId: "berlin", who: "olle", tab: "up" as const, day: "2026-11-02" };
    await s.saveUsage(u); await s.saveUsage(u); await s.saveUsage({ ...u, tab: "mi" });
    assert.deepEqual((await s.usage()).map((x) => x.tab).sort(), ["mi", "up"]);
  });
}
