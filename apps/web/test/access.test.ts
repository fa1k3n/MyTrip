import { test } from "node:test";
import assert from "node:assert/strict";
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

