import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { pageSize } from "../size-check.ts";

// A fake dist folder: an index.html loading one script and one stylesheet, plus a lazy chunk that is not loaded at first.
function fakeDist(scriptBytes: number) {
  const dir = mkdtempSync(join(tmpdir(), "dist-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), '<script type="module" crossorigin src="/assets/index-a.js"></script><link rel="modulepreload" href="/assets/vendor-b.js"><link rel="stylesheet" href="/assets/index-c.css">');
  writeFileSync(join(dir, "assets/index-a.js"), randomBytes(scriptBytes)); // random bytes do not compress
  writeFileSync(join(dir, "assets/vendor-b.js"), "x".repeat(1000));
  writeFileSync(join(dir, "assets/index-c.css"), "a{color:red}");
  writeFileSync(join(dir, "assets/lazy-d.js"), randomBytes(500_000));
  return dir;
}

test("PF-01 DP-17 the page file counts what index.html loads, gzipped, and not the lazy chunks", () => {
  const r = pageSize(fakeDist(10_000), 200);
  assert.deepEqual(r.files.map((f) => f.name).sort(), ["assets/index-a.js", "assets/index-c.css", "assets/vendor-b.js"]);
  assert.ok(r.bytes > 10_000 && r.bytes < 11_000, `${r.bytes}`);
  assert.equal(r.ok, true);
});

test("PF-01 DP-17 a page file over the limit fails the check", () => {
  const r = pageSize(fakeDist(250_000), 200);
  assert.equal(r.ok, false);
  assert.ok(r.bytes > 200 * 1024);
});
