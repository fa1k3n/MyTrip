import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_ICON, nextLevel, PERM_ROLES } from "../src/access.ts";
import { travelerLine } from "../src/format.ts";

// REQ: AU-37 two role columns, Resenär then Följare; a cell steps through its levels and back to the first; each level has its icon
test("AU-37 columns and cells", () => {
  assert.deepEqual(PERM_ROLES, ["traveler", "follower"]);
  assert.equal(nextLevel(["hidden", "read", "add", "write"], "add"), "write");
  assert.equal(nextLevel(["hidden", "read", "add", "write"], "write"), "hidden");
  assert.equal(nextLevel(["shown", "hidden"], "shown"), "hidden");
  assert.deepEqual(LEVEL_ICON, { hidden: "eyeoff", read: "eye", shown: "eye", check: "check", add: "plus", write: "edit" });
});

// REQ: AU-38 a traveler's row says the permission, and that the traveler does not share costs when so
test("AU-38 the line under a traveler's name", () => {
  assert.equal(travelerLine("planner", true), "Planerare");
  assert.equal(travelerLine("traveler", false), "Resenär · delar inte på kostnader");
});

// REQ: AU-36 what each role may see and do in the app follows the content levels; a Planerare has everything
test("AU-36 permsFor", async () => {
  const { permsFor, anyWrite } = await import("../src/access.ts");
  const f = permsFor("link", { access: { follower: { tabs: { nala: true }, content: { todo: "check" } } } });
  assert.deepEqual([f.scoped, f.pages, f.view.nala.tasks, f.view.nala.budget, anyWrite(f)], [true, ["nala", "up"], "check", "hidden", false]);
  const tr = permsFor("traveler", { access: { traveler: { content: { money: "hidden" } } } });
  assert.deepEqual([tr.view.up.expenses, tr.view.mi.expenses, tr.view.nala.budget], ["hidden", "hidden", "hidden"]);
  const d = permsFor("traveler", {});
  assert.deepEqual([d.settings, d.pages, d.view.up.expenses, anyWrite(d)], [false, ["dr", "nala", "up", "mi"], "add", false]);
  const pl = permsFor("planner", {});
  assert.deepEqual([pl.settings, anyWrite(pl)], [true, true]);
  const su = permsFor("admin", {});
  assert.deepEqual([su.scoped, su.superuser, su.settings, su.pages.length, su.view.nala.budget, su.view.up.expenses, su.view.mi.expenses], [false, true, true, 4, "write", "add", "write"]);
});
