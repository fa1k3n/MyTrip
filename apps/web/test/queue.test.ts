import { test } from "node:test";
import assert from "node:assert/strict";
import { dropCopy, enqueue, flush, loadQueue, saveQueue, unsent, withWaiting, type Sent, type Store } from "../src/offline.ts";

function memory(): Store {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
}
const anna = "person.berlin.anna.AbC_-1";
const e = (id: string, amount = 60) => ({ id, text: "Glass", category: "Mat/Fritid", amount, paidBy: "anna", sharedBy: [] });

// REQ: PW-06 an expense added offline is stored on the phone at once and counts in the budget status until the server has it
test("PW-06 waiting expenses are kept and counted", () => {
  const s = memory();
  saveQueue(s, anna, enqueue(loadQueue(s, anna), e("e1")));
  saveQueue(s, anna, enqueue(loadQueue(s, anna), e("e2", 40)));
  const q = loadQueue(s, anna);
  assert.deepEqual(q.map((x) => [x.expense.id, x.state]), [["e1", "waiting"], ["e2", "waiting"]]);
  const t = withWaiting({ expenses: [e("e0", 100)] }, q);
  assert.deepEqual(t.expenses.map((x) => [x.id, x.amount, x.waiting]), [["e0", 100, undefined], ["e1", 60, "waiting"], ["e2", 40, "waiting"]]);
  assert.deepEqual(withWaiting({ expenses: [e("e1")] }, q).expenses.map((x) => x.id), ["e1", "e2"], "one the server already has is not counted twice");
  assert.equal(unsent(q), 2);
  dropCopy(s, anna);
  assert.deepEqual(loadQueue(s, anna), [], "the queue goes with its link (PW-17)");
});

// REQ: PW-07 waiting expenses are sent by themselves in the order they were added
test("PW-07 flush sends in order and keeps what could not be sent", async () => {
  const sent: string[] = [];
  const ok = async (x: { id: string }): Promise<Sent> => { sent.push(x.id); return { ok: true }; };
  const q = enqueue(enqueue([], e("e1")), e("e2"));
  assert.deepEqual(await flush(q, ok), []);
  assert.deepEqual(sent, ["e1", "e2"]);
  let n = 0;
  const offlineAfterOne = async (): Promise<Sent> => (n++ ? { offline: true } : { ok: true });
  assert.deepEqual((await flush(q, offlineAfterOne)).map((x) => x.expense.id), ["e2"], "without a network the rest waits");
});

// REQ: PW-09 a rejected expense is kept, marked with the reason, and can be sent again or removed
test("PW-09 a rejected expense stays with its reason", async () => {
  const q = enqueue(enqueue([], e("e1")), e("e2"));
  const rejectFirst = async (x: { id: string }): Promise<Sent> => (x.id === "e1" ? { failed: "Behörigheten har ändrats." } : { ok: true });
  const after = await flush(q, rejectFirst);
  assert.deepEqual(after.map((x) => [x.expense.id, x.state, x.reason]), [["e1", "failed", "Behörigheten har ändrats."]], "the next one is still sent");
  assert.deepEqual(await flush(after, async () => ({ ok: true })), after, "a failed one is not sent again by itself");
  assert.equal(unsent(after), 1);
  assert.equal(withWaiting({ expenses: [] as ReturnType<typeof e>[] }, after).expenses[0].waiting, "failed");
});
