import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { needsConsent, seenKey } from "../src/access.ts";
import { sv } from "../src/sv.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

// REQ: US-26 an account sees the beta notice until it has accepted it; links and the admin password never do
test("US-26 the beta notice blocks an account until accepted", () => {
  const user = { id: "olle", name: "Olle", superuser: false };
  assert.equal(needsConsent({ role: "account", user, trips: {}, consent: false }), true);
  assert.equal(needsConsent({ role: "account", user, trips: {} }), true);
  assert.equal(needsConsent({ role: "account", user, trips: {}, consent: true }), false);
  assert.equal(needsConsent({ role: "admin" }), false);
  assert.equal(needsConsent({ role: "traveler", tripId: "x", travelerId: "anna" }), false);
  const points = sv.beta.consentPoints.join(" ");
  for (const w of ["EU", "kan se allt", "Önska, Nåla, Uppleva och Minnas", "tas bort"]) assert.ok(points.includes(w), w);
  assert.match(src("Admin.tsx"), /disabled=\{busy \|\| !pw \|\| !ok\}/, "the password is saved only with the notice accepted");
});

// REQ: US-27 the feedback button is marked as a beta feature
test("US-27 Tyck till is clearly marked Beta", () => {
  assert.equal(sv.beta.feedback, "Tyck till (beta)");
  assert.equal(sv.beta.tag, "Beta");
  assert.match(src("Icons.tsx"), /className="betatag"/);
  assert.match(src("index.css"), /\.betatag\{[^}]*background:var\(--acc\)/);
});

// REQ: US-28 a page open is sent once per trip, page and day
test("US-28 the device remembers one page open per trip, page and day", () => {
  assert.equal(seenKey("berlin", "up"), "mytrip.seen.berlin.up");
});
