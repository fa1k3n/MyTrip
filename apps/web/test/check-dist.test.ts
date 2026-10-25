import { test } from "node:test";
import assert from "node:assert/strict";
import { findSecrets } from "../check-dist.ts";

// Fake keys are put together at run time so the source never looks like a real key to secret scanners.
const google = ["AI", "za", "SyA1234567890abcdefghijklmnopqrstuv"].join(""), anthropic = ["sk", "-ant-", "api03-abcdefghijklmnop"].join("");

test("DP-08 AU-08 a built file with a configured secret or a key pattern is found", () => {
  const files = [
    { name: "assets/index.js", text: 'const h="Bearer "+x;fetch("/api/me")' },
    { name: "assets/a.js", text: 'const t="s3cret-admin-token-123"' },
    { name: "assets/b.js", text: `key:"${google}"` },
    { name: "assets/c.js", text: `k="${anthropic}"` },
  ];
  assert.deepEqual(findSecrets(files, ["s3cret-admin-token-123", "a", ""]), [
    "assets/a.js: a configured secret", "assets/b.js: a Google API key", "assets/c.js: an Anthropic API key",
  ]);
});

test("DP-08 short values such as the one-letter dev tokens are ignored", () => {
  assert.deepEqual(findSecrets([{ name: "x.js", text: "a r p" }], ["a", "r", "p"]), []);
});
