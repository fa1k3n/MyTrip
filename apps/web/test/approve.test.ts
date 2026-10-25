import { test } from "node:test";
import assert from "node:assert/strict";
import { approveExpense, balances, rejectExpense, settled, unhandled } from "../src/money.ts";

const people = [{ id: "anna" }, { id: "bo" }];
const expenses = [
  { id: "e1", amount: 100, paidBy: "anna", sharedBy: [] },
  { id: "e2", amount: 60, paidBy: "bo", sharedBy: [], pending: true },
];

// REQ: MI-10 an unhandled expense does not count in the balances until it is approved
test("MI-10 balances count approved expenses only", () => {
  assert.deepEqual(settled(expenses).map((e) => e.id), ["e1"]);
  assert.deepEqual(balances(people, settled(expenses), []), { anna: 50, bo: -50 });
  assert.deepEqual(unhandled(expenses).map((e) => e.id), ["e2"]);
});

// REQ: MI-11 a Planerare approves an unhandled expense or rejects it, which removes it
test("MI-11 approve and reject", () => {
  const t = { expenses };
  assert.deepEqual(approveExpense(t, "e2"), [{ op: "remove", path: "expenses/1/pending" }]);
  assert.deepEqual(rejectExpense(t, "e2"), [{ op: "remove", path: "expenses/1" }]);
  assert.deepEqual(approveExpense(t, "gone"), [], "already handled by someone else");
});
