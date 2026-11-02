import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFor, atLeast, opNeeds, Trip } from "../src/index.ts";

const trip = (access?: object) => Trip.parse({ id: "t", revision: 1, title: "t", timezone: "UTC", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [], ...(access ? { access } : {}) });

// REQ: AU-22 levels outside a component's list are rejected; a Följare can never add or change expenses
test("AU-22 invalid levels are rejected", () => {
  for (const access of [{ traveler: { nala: { parts: { plan: "hidden" } } } }, { traveler: { nala: { parts: { bookings: "check" } } } },
    { traveler: { up: { parts: { budget: "write" } } } }, { follower: { up: { parts: { expenses: "add" } } } }, { follower: { mi: { parts: { expenses: "add" } } } },
    { traveler: { x: { visible: true } } }, { traveler: { dr: { parts: { plan: "read" } } } }])
    assert.equal(Trip.safeParse({ ...trip(), access }).success, false, JSON.stringify(access));
  assert.equal(Trip.safeParse({ ...trip(), access: { follower: { mi: { visible: true, parts: { expenses: "read" } } } } }).success, true);
});

// REQ: AU-21 each change needs a component and a level
test("AU-21 opNeeds and atLeast", () => {
  const n = (op: string, path: string, value?: unknown) => opNeeds({ op: op as "set", path, value });
  assert.deepEqual(n("set", "tasks/0/done", true), { part: "tasks", level: "check" });
  assert.deepEqual(n("set", "tasks/0/text", "x"), { part: "tasks", level: "write" });
  assert.deepEqual(n("set", "packed", []), { part: "packing", level: "check" });
  assert.deepEqual(n("set", "travelers/1/packed", []), { part: "packing", level: "check" });
  assert.deepEqual(n("add", "travelers/1/packing/-", "x"), { part: "packing", level: "write" });
  assert.deepEqual(n("add", "expenses/-", {}), { part: "expenses", level: "add" });
  assert.deepEqual(n("remove", "expenses/0"), { part: "expenses", level: "write" });
  assert.deepEqual(n("add", "payments/-", {}), { part: "expenses", level: "write" });
  assert.deepEqual(n("set", "days/0/title", "x"), { part: "plan", level: "write" });
  assert.deepEqual(n("add", "places/-", {}), { part: "plan", level: "write" });
  assert.deepEqual(n("set", "budgetMax", 1), { part: "budget", level: "write" });
  assert.deepEqual(n("set", "dreams/0/votes", 2), { part: "dreams", level: "write" });
  assert.deepEqual(n("set", "title", "x"), { part: "trip", level: "write" });
  assert.deepEqual(n("add", "travelers/-", {}), { part: "trip", level: "write" });
  assert.deepEqual(n("set", "access", {}), { part: "access", level: "write" });
  assert.equal(atLeast("write", "check"), true);
  assert.equal(atLeast("check", "write"), false);
  assert.equal(atLeast("add", "add"), true);
  assert.equal(atLeast("read", "add"), false);
  assert.equal(atLeast("hidden", "read"), false);
});
