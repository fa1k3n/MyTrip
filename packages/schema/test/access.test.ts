import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFor, atLeast, opNeeds, Trip } from "../src/index.ts";

const trip = (access?: object) => Trip.parse({ id: "t", revision: 1, title: "t", timezone: "UTC", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [], ...(access ? { access } : {}) });

// REQ: AU-20 the defaults per role are the earlier fixed rules
test("AU-20 default permissions per role", () => {
  const f = accessFor(trip(), "follower");
  assert.deepEqual(f.pages, ["up"]);
  assert.deepEqual(f.parts, { plan: "read", bookings: "hidden", budget: "hidden", expenses: "hidden", tasks: "hidden", packing: "hidden", info: "hidden", dreams: "hidden" });
  assert.deepEqual(f.view.nala, { plan: "hidden", bookings: "hidden", budget: "hidden", tasks: "hidden", info: "hidden", packing: "hidden" }, "a hidden page hides its components");
  const tr = accessFor(trip(), "traveler");
  assert.deepEqual(tr.pages, ["dr", "nala", "up", "mi"]);
  assert.deepEqual(tr.parts, { plan: "read", bookings: "read", budget: "read", expenses: "add", tasks: "check", packing: "check", info: "read", dreams: "read" });
  assert.deepEqual(accessFor(trip(), "planner").parts, { plan: "write", bookings: "write", budget: "write", expenses: "write", tasks: "write", packing: "write", info: "write", dreams: "write" });
});

// REQ: AU-20 a trip overrides page visibility and component levels per page; data follows the pages that show it
test("AU-20 a trip overrides pages and components per page", () => {
  const t = trip({
    follower: { nala: { visible: true, parts: { tasks: "check" } }, up: { parts: { budget: "read" } } },
    traveler: { nala: { parts: { budget: "hidden" } }, mi: { visible: false } },
  });
  const f = accessFor(t, "follower");
  assert.deepEqual([f.pages, f.view.nala.tasks, f.view.nala.budget, f.view.up.budget], [["nala", "up"], "check", "hidden", "read"]);
  assert.deepEqual([f.parts.tasks, f.parts.budget, f.parts.info], ["check", "read", "hidden"]);
  const tr = accessFor(t, "traveler");
  assert.deepEqual([tr.view.nala.budget, tr.view.up.budget, tr.parts.budget], ["hidden", "read", "read"], "budget still reaches Uppleva");
  assert.deepEqual([tr.pages, tr.view.mi.expenses, tr.parts.expenses], [["dr", "nala", "up"], "hidden", "add"], "adding in Uppleva is enough to add");
});

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
