import { test } from "node:test";
import assert from "node:assert/strict";
import { accountSlot, dropAllCopies, enqueue, forgetAccount, keepAccount, loadCopy, loadQueue, retry, saveCopy, saveQueue, storedAccount, withWaiting, type Expense, type Store } from "../src/offline.ts";

function memory(): Store & { keys: () => string[] } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, keys: () => [...m.keys()],
  };
}
const anna = "person.berlin.anna.AbC_-1";
const at = "2026-11-02T12:00:00.000Z";

// REQ: PW-22 an account keeps a copy of its trips under its own name, so the app starts without a network after a login
test("PW-22 a copy per account", () => {
  const s = memory();
  assert.equal(storedAccount(s), null);
  keepAccount(s, "kim");
  assert.equal(storedAccount(s), "kim", "the next start knows whose copy to read");
  saveCopy(s, accountSlot("kim"), { me: { role: "account", user: { id: "kim" } }, trips: [{ id: "berlin" }] }, at);
  assert.deepEqual(loadCopy(s, accountSlot("kim"))!.trips, [{ id: "berlin" }]);
  assert.notEqual(accountSlot("kim"), "kim", "an account's slot can never be a link key");
  keepAccount(s, "kim");
  assert.ok(loadCopy(s, accountSlot("kim")), "logging in again with the same account keeps the copy");
});

// REQ: PW-22 another account on the same phone removes the earlier account's copy and waiting expenses
test("PW-22 another account", () => {
  const s = memory();
  keepAccount(s, "kim");
  saveCopy(s, accountSlot("kim"), { trips: [] }, at);
  saveQueue(s, accountSlot("kim"), enqueue([], { id: "e1", amount: 5 }, "berlin"));
  keepAccount(s, "alex");
  assert.equal(loadCopy(s, accountSlot("kim")), null);
  assert.deepEqual(loadQueue(s, accountSlot("kim")), []);
  assert.equal(storedAccount(s), "alex");
});

// REQ: PW-22 #admin removes the links' copies, not the account's
test("PW-22 #admin keeps the account's copy", () => {
  const s = memory();
  keepAccount(s, "kim");
  saveCopy(s, accountSlot("kim"), { trips: [] }, at);
  saveCopy(s, anna, { trips: [] }, at);
  dropAllCopies(s);
  assert.equal(loadCopy(s, anna), null);
  assert.ok(loadCopy(s, accountSlot("kim")));
});

// REQ: PW-22 an account's waiting expense keeps its trip, so it is sent to it and counted only in it
test("PW-22 waiting expenses per trip", () => {
  const q = enqueue(enqueue([], { id: "e1", amount: 5 }, "berlin"), { id: "e2", amount: 7 }, "skane");
  assert.equal(q[0]!.tripId, "berlin");
  const failed = [{ ...q[0]!, state: "failed" as const, reason: "Nej" }];
  assert.deepEqual(retry(failed, "e1"), [{ expense: { id: "e1", amount: 5 }, state: "waiting", tripId: "berlin" }], "trying again keeps the trip");
  const t = withWaiting({ id: "berlin", expenses: [] as Expense[] }, q);
  assert.deepEqual(t.expenses.map((e) => e.id), ["e1"], "another trip's waiting expense is not counted");
  assert.deepEqual(withWaiting({ id: "berlin", expenses: [] as Expense[] }, enqueue([], { id: "e3", amount: 1 })).expenses.map((e) => e.id), ["e3"], "a link's expense has no trip and counts in its own");
});

// REQ: PW-23 logging out removes the account's copy and waiting expenses from the phone
test("PW-23 forgetAccount", () => {
  const s = memory();
  keepAccount(s, "kim");
  saveCopy(s, accountSlot("kim"), { trips: [] }, at);
  saveQueue(s, accountSlot("kim"), enqueue([], { id: "e1", amount: 5 }, "berlin"));
  saveCopy(s, anna, { trips: [] }, at);
  forgetAccount(s);
  assert.equal(storedAccount(s), null);
  assert.equal(loadCopy(s, accountSlot("kim")), null);
  assert.deepEqual(loadQueue(s, accountSlot("kim")), []);
  assert.ok(loadCopy(s, anna), "a link on the phone stays");
});
