import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_ICON, nextLevel, PERM_ROLES } from "../src/access.ts";
import { svAdmin } from "../src/sv-admin.ts";

// REQ: AU-35 a matrix cell steps through the levels it allows and back to the first; each level has its icon
test("AU-35 nextLevel and the level icons", () => {
  assert.equal(nextLevel(["hidden", "read", "write"], "hidden"), "read");
  assert.equal(nextLevel(["hidden", "read", "write"], "read"), "write");
  assert.equal(nextLevel(["hidden", "read", "write"], "write"), "hidden");
  assert.equal(nextLevel(["hidden", "read", "check", "write"], "read"), "check");
  assert.equal(nextLevel(["shown", "hidden"], "shown"), "hidden");
  assert.equal(nextLevel(["read", "write"], "gone"), "read", "an unknown level starts from the first");
  assert.deepEqual(LEVEL_ICON, { hidden: "eyeoff", read: "eye", shown: "eye", check: "check", add: "plus", write: "edit" });
  assert.equal(svAdmin.perms.cell("Packlista", "Resenär", "Bocka av"), "Packlista, Resenär: Bocka av. Tryck för att byta.");
});

// REQ: AU-34 the columns are Planerare, Resenär, Följare
test("AU-34 column order", () => {
  assert.deepEqual(PERM_ROLES, ["planner", "traveler", "follower"]);
});
