import { test } from "node:test";
import assert from "node:assert/strict";
import { AccessConfig, accessFor, CONTENT, contentLevels, Trip } from "../src/index.ts";

const trip = (access?: object) => Trip.parse({ id: "t", revision: 1, title: "t", timezone: "UTC", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [], ...(access ? { access } : {}) });

// REQ: AU-36 the defaults are the earlier fixed rules; a Planerare always has everything
test("AU-36 defaults", () => {
  const f = accessFor(trip(), "follower");
  assert.deepEqual(f.pages, ["up"]);
  assert.deepEqual(f.parts, { plan: "read", bookings: "hidden", budget: "hidden", expenses: "hidden", tasks: "hidden", packing: "hidden", info: "hidden", dreams: "hidden" });
  const tr = accessFor(trip(), "traveler");
  assert.deepEqual(tr.pages, ["dr", "nala", "up", "mi"]);
  assert.deepEqual(tr.parts, { plan: "read", bookings: "read", budget: "read", expenses: "add", tasks: "check", packing: "check", info: "read", dreams: "read" });
  assert.deepEqual([tr.view.up.expenses, tr.view.mi.expenses, tr.view.mi.memories], ["add", "add", "write"]);
  assert.deepEqual(accessFor(trip(), "planner").parts, { plan: "write", bookings: "write", budget: "write", expenses: "write", tasks: "write", packing: "write", info: "write", dreams: "write" });
  assert.deepEqual(CONTENT, ["plan", "dreams", "bookings", "money", "todo", "info", "memories"]);
});

// REQ: AU-36 a content level holds wherever the content is shown: Pengar is the budget and the expenses on every tab
test("AU-36 one level per content, on every tab", () => {
  const money = (level: string) => accessFor(trip({ traveler: { content: { money: level } } }), "traveler").view;
  const m = (v: ReturnType<typeof money>) => [v.nala.budget, v.up.budget, v.up.expenses, v.mi.budget, v.mi.expenses];
  assert.deepEqual(m(money("hidden")), ["hidden", "hidden", "hidden", "hidden", "hidden"]);
  assert.deepEqual(m(money("read")), ["read", "read", "hidden", "read", "read"]);
  assert.deepEqual(m(money("add")), ["read", "read", "add", "read", "add"]);
  assert.deepEqual(m(money("write")), ["write", "read", "add", "read", "write"]);
  const b = accessFor(trip({ traveler: { content: { bookings: "hidden", todo: "write" } } }), "traveler");
  assert.deepEqual([b.view.nala.bookings, b.view.up.bookings, b.parts.bookings, b.view.nala.tasks, b.view.nala.packing], ["hidden", "hidden", "hidden", "write", "write"]);
});

// REQ: AU-36 a hidden tab shows nothing; what another tab shows still reaches the role
test("AU-36 tabs", () => {
  const r = accessFor(trip({ traveler: { tabs: { nala: false } }, follower: { tabs: { dr: true }, content: { dreams: "read" } } }), "traveler");
  assert.deepEqual(r.pages, ["dr", "up", "mi"]);
  assert.deepEqual([r.view.nala.budget, r.parts.budget, r.parts.tasks], ["hidden", "read", "hidden"]);
  const f = accessFor(trip({ follower: { tabs: { dr: true }, content: { dreams: "read" } } }), "follower");
  assert.deepEqual([f.pages, f.view.dr.dreams], [["dr", "up"], "read"]);
});

// REQ: AU-36 a Följare gets at most Läsa for Pengar and only Dold for Minnen; a Planerare is not configured; levels outside a content's list are rejected
test("AU-36 allowed levels", () => {
  assert.deepEqual(contentLevels("traveler", "money"), ["hidden", "read", "add", "write"]);
  assert.deepEqual(contentLevels("follower", "money"), ["hidden", "read"]);
  assert.deepEqual(contentLevels("follower", "memories"), ["hidden"]);
  assert.deepEqual(contentLevels("traveler", "plan"), ["read", "write"]);
  for (const bad of [{ follower: { content: { money: "add" } } }, { follower: { content: { memories: "read" } } }, { traveler: { content: { plan: "hidden" } } },
    { traveler: { content: { budget: "read" } } }, { traveler: { tabs: { x: true } } }, { planner: { content: { plan: "read" } } }])
    assert.equal(AccessConfig.safeParse(bad).success, false, JSON.stringify(bad));
  assert.equal(AccessConfig.safeParse({ traveler: { tabs: { mi: false }, content: { money: "hidden" } } }).success, true);
});

// REQ: AU-36 permissions saved per page and component keep working, read as the nearest content levels
test("AU-36 earlier permissions", () => {
  const t = trip({ traveler: { dr: { parts: { dreams: "hidden" } }, mi: { visible: false } }, follower: { nala: { visible: true, parts: { tasks: "check" } } } });
  assert.deepEqual(t.access, { traveler: { tabs: { mi: false }, content: { dreams: "hidden" } }, follower: { tabs: { nala: true }, content: { todo: "check" } } });
  assert.deepEqual(trip({ planner: { nala: { parts: { plan: "read" } } } }).access, {}, "a Planerare's choices are dropped");
  const raw = { traveler: { nala: { parts: { budget: "hidden" } } } }; // as the app may get it, unparsed
  assert.deepEqual(accessFor({ access: raw as never }, "traveler").view.mi.budget, "hidden");
});
