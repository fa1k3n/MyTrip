import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinkHash, parseSetupHash, permsFor, roleIcons, roleIn, setupUrl, whoChip } from "../src/access.ts";

const me = {
  role: "account" as const, user: { id: "olle", name: "Olle", superuser: false },
  trips: {
    egen: { role: "owner" as const, roles: ["owner" as const, "traveler" as const], travelerId: "olle" },
    berlin: { role: "planner" as const, roles: ["planner" as const], travelerId: "o" },
    skane: { role: "traveler" as const, roles: ["traveler" as const], travelerId: "o2" },
  },
};

// REQ: US-04 the password link carries the account and its secret after #, and is no trip link
test("US-04 the password link is #u=<user>.<secret> and is not taken for a trip link", () => {
  const url = setupUrl("https://baslager.example", "eva", "AbC_-123");
  assert.equal(url, "https://baslager.example/#u=eva.AbC_-123");
  assert.deepEqual(parseSetupHash(new URL(url).hash), { user: "eva", secret: "AbC_-123" });
  assert.equal(parseLinkHash("#u=eva.AbC_-123"), null);
  assert.equal(parseSetupHash("#l=berlin.x"), null);
});

// REQ: US-14 US-22 a user's role and traveler depend on the trip
test("US-14 US-22 a user's role on each trip, and the start page before one is chosen", () => {
  assert.deepEqual(roleIn(me, "egen"), { role: "owner" }); // the owner keeps the owner's rights and picks who paid
  assert.deepEqual(roleIn(me, "berlin"), { role: "planner", travelerId: "o" });
  assert.deepEqual(roleIn(me, "skane"), { role: "traveler", travelerId: "o2" });
  assert.deepEqual(roleIn(me, undefined), { role: "account" });
  assert.deepEqual(roleIn({ role: "traveler", tripId: "x", travelerId: "anna" }, "x"), { role: "traveler", travelerId: "anna" }); // a personal link as before
  assert.deepEqual(roleIn({ role: "admin" }, "x"), { role: "admin" });
});

// REQ: US-14 the owner can do everything on the trip, but has none of the superuser's own cards
test("US-14 the owner has full rights on the trip without being the superuser", () => {
  const p = permsFor("owner", {});
  assert.deepEqual([p.scoped, p.superuser, p.manager, p.settings], [false, false, true, true]);
  assert.equal(p.view.nala.plan, "write");
  assert.deepEqual([permsFor("admin", {}).superuser, permsFor("admin", {}).manager], [true, true]);
  assert.equal(permsFor("planner", {}).manager, false);
  assert.equal(permsFor("account", {}).scoped, false); // a user has the start page
});

// REQ: US-23 US-24 role icons on the trip cards
test("US-23 US-24 the role icons of a trip card", () => {
  assert.deepEqual(roleIcons(me, "egen"), ["owner", "traveler"]);
  assert.deepEqual(roleIcons(me, "berlin"), ["planner"]);
  assert.deepEqual(roleIcons(me, "nope"), []);
  assert.deepEqual(roleIcons({ role: "admin" }, "egen"), []); // the admin password has no account
});

// REQ: US-25 the chip on Drömmar names who is logged in
test("US-25 the chip on Drömmar shows the user, or Administratör for the admin password", () => {
  assert.equal(whoChip(me), "Olle");
  assert.equal(whoChip({ role: "admin" }), "Administratör");
});
