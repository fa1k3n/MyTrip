import { test } from "node:test";
import assert from "node:assert/strict";
import type { AccessConfig } from "@trip/schema/src/rules.ts";
import { anyWrite, authHeader, missingLinks, parseLinkHash, permsFor, personUrl, shareUrl } from "../src/access.ts";

test("AU-01 AU-06 the share link carries the trip and its secret after #", () => {
  const url = shareUrl("https://mytrip.example.workers.dev", "berlin", "AbC_-123");
  assert.equal(url, "https://mytrip.example.workers.dev/#l=berlin.AbC_-123");
  assert.deepEqual(parseLinkHash(new URL(url).hash), { kind: "link", key: "link.berlin.AbC_-123", tripId: "berlin" });
});

test("AU-02 other fragments are not links; #admin asks for the admin login", () => {
  assert.equal(parseLinkHash(""), null);
  assert.equal(parseLinkHash("#day-3"), null);
  assert.equal(parseLinkHash("#l=Berlin.x"), null); // trip ids are lower case
  assert.equal(parseLinkHash("#l=berlin."), null);
  assert.deepEqual(parseLinkHash("#admin"), { kind: "admin" });
});

test("AU-08 a share link wins over the development token; without either the session cookie is used", () => {
  assert.equal(authHeader("dev", "link.berlin.s"), "Bearer link.berlin.s");
  assert.equal(authHeader("dev", null), "Bearer dev");
  assert.equal(authHeader("", null), undefined);
});

test("AU-11 a personal link carries the trip, the traveler and the secret after #", () => {
  const url = personUrl("https://mytrip.example.workers.dev", "berlin", "anna", "AbC_-123");
  assert.equal(url, "https://mytrip.example.workers.dev/#p=berlin.anna.AbC_-123");
  assert.deepEqual(parseLinkHash(new URL(url).hash), { kind: "link", key: "person.berlin.anna.AbC_-123", tripId: "berlin" });
  assert.equal(parseLinkHash("#p=berlin.AbC"), null);
});


test("AU-11 the travelers without a personal link get one when the settings open", () => {
  const travelers = [{ id: "anna" }, { id: "bo" }, { id: "cia" }];
  assert.deepEqual(missingLinks(travelers, [{ travelerId: "bo" }]), ["anna", "cia"]);
  assert.deepEqual(missingLinks(travelers, travelers.map((x) => ({ travelerId: x.id }))), []);
});

test("AU-20 AU-21 what each role may see and do follows the trip's permissions", () => {
  const t: { access: AccessConfig } = { access: { follower: { nala: { visible: true, parts: { tasks: "check" } } } } };
  const f = permsFor("link", t);
  assert.deepEqual([f.scoped, f.superuser, f.settings, f.pages, f.view.nala.tasks, f.view.nala.budget], [true, false, false, ["nala", "up"], "check", "hidden"]);
  assert.equal(anyWrite(f), false);
  const tr = permsFor("traveler", {});
  assert.deepEqual([tr.settings, tr.pages, tr.view.up.expenses, anyWrite(tr)], [false, ["dr", "nala", "up", "mi"], "add", false]);
  const pl = permsFor("planner", {});
  assert.deepEqual([pl.settings, anyWrite(pl)], [true, true]);
  const su = permsFor("admin", {});
  assert.deepEqual([su.scoped, su.superuser, su.settings, su.pages.length, su.view.nala.budget, su.view.up.expenses, su.view.mi.expenses], [false, true, true, 4, "write", "add", "write"]);
});
