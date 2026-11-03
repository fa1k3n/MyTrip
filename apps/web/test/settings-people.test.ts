import { test } from "node:test";
import assert from "node:assert/strict";
import { customAccess, permSwitches, switchAccess } from "../src/access.ts";
import { travelerLine } from "../src/format.ts";

// REQ: AU-40 a traveler's row says the permission, the login status (US-36), and that the traveler does not share costs when so
test("AU-40 the line under a traveler's name", () => {
  assert.equal(travelerLine("planner", true, "active"), "Planerare · Har konto");
  assert.equal(travelerLine("traveler", false, "none"), "Resenär · Inte inbjuden · delar inte på kostnader");
});

// REQ: US-36 each login status has its text; without a status the traveler is not invited
test("US-36 login status texts", () => {
  assert.equal(travelerLine("traveler", true, "invited"), "Resenär · Inbjuden, har inte loggat in");
  assert.equal(travelerLine("traveler", true, "disabled"), "Resenär · Kontot är avstängt");
  assert.equal(travelerLine("traveler", true), "Resenär · Inte inbjuden");
});

// REQ: AU-41 three switches: Resenärer see money, Resenärer wish and vote, Följare see the whole plan; the defaults are on, off, off
test("AU-41 the switches and what they store", () => {
  assert.deepEqual(permSwitches({}), { money: true, wishes: false, followerAll: false });
  assert.deepEqual(switchAccess({ money: true, wishes: false, followerAll: false }), {});
  const all = switchAccess({ money: false, wishes: true, followerAll: true });
  assert.deepEqual(all, {
    traveler: { content: { money: "hidden", dreams: "write" } },
    follower: { tabs: { dr: true, nala: true }, content: { dreams: "read", bookings: "read", info: "read" } },
  });
  assert.deepEqual(permSwitches({ access: all }), { money: false, wishes: true, followerAll: true });
  assert.equal(customAccess({ access: all }), false);
});

// REQ: AU-41 stored permissions the switches cannot give are shown as Anpassade until a switch is changed
test("AU-41 custom permissions", () => {
  assert.equal(customAccess({}), false);
  assert.equal(customAccess({ access: { traveler: { content: { money: "read" } } } }), true);
  assert.equal(customAccess({ access: { follower: { tabs: { mi: true } } } }), true);
  assert.equal(customAccess({ access: { traveler: { content: { money: "add" } } } }), false, "a default written out is not custom");
});
