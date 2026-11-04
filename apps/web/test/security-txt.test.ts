// DP-22: checks the vulnerability reporting files of the public repository and the app (security.txt, SECURITY.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "..");
const txt = readFileSync(join(root, "apps/web/public/.well-known/security.txt"), "utf8");

function field(name: string): string[] {
  return txt.split("\n").filter((l) => l.startsWith(`${name}:`)).map((l) => l.slice(name.length + 1).trim());
}

test("DP-22: security.txt has a Contact that is a role address, not a personal one", () => {
  const contact = field("Contact");
  assert.equal(contact.length, 1);
  assert.equal(contact[0], "mailto:security@falkenproduktion.se");
});

test("DP-22: security.txt has an Expires in the future, at most a year and a month ahead", () => {
  const expires = field("Expires");
  assert.equal(expires.length, 1);
  const when = Date.parse(expires[0]);
  assert.ok(!Number.isNaN(when), "Expires is a date");
  const now = Date.now();
  assert.ok(when > now, "Expires is in the future");
  assert.ok(when - now < 400 * 24 * 3600 * 1000, "Expires is no more than about a year ahead");
});

test("DP-22: security.txt names the policy and the languages", () => {
  assert.deepEqual(field("Policy"), ["https://github.com/fa1k3n/MyTrip/blob/main/SECURITY.md"]);
  assert.deepEqual(field("Preferred-Languages"), ["sv, en"]);
});

test("DP-22: SECURITY.md exists in the platform repository", () => {
  assert.ok(existsSync(join(root, "SECURITY.md")));
});
