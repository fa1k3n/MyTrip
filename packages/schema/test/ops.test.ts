import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps } from "../src/ops.ts";

// REQ: MC-04 dry runs must never change stored data
test("MC-04 applyOps does not mutate its input", () => {
  const doc = { days: [{ title: "A" }] };
  const out = applyOps(doc, [{ op: "set", path: "days/0/title", value: "B" }]);
  assert.equal(doc.days[0].title, "A");
  assert.equal(out.days[0].title, "B");
});

// REQ: MC-02 add, change and remove must work on lists and objects
test("MC-02 applyOps supports set, add and remove", () => {
  const out = applyOps({ tasks: [{ id: "a" }], x: 1 }, [
    { op: "add", path: "tasks/-", value: { id: "b" } },
    { op: "remove", path: "tasks/0" },
    { op: "remove", path: "x" },
  ]);
  assert.deepEqual(out, { tasks: [{ id: "b" }] });
});

// REQ: MC-03 invalid changes are rejected with a message
test("MC-03 applyOps rejects unknown paths and bad indexes", () => {
  assert.throws(() => applyOps({ a: [] }, [{ op: "set", path: "b/c", value: 1 }]), /Path not found/);
  assert.throws(() => applyOps({ a: [1] }, [{ op: "remove", path: "a/5" }]), /Index out of range/);
});
