import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dreams = readFileSync(new URL("../src/Dreams.tsx", import.meta.url), "utf8");

// REQ: DB-28 while a wish's image loads, or when it cannot be fetched or shown, the card shows the category icon as a wish without an image does
test("DB-28 the icon until the image is there", () => {
  assert.match(dreams, /export function WishPicture\(\{ tripId, file, whole = false, fallback \}/);
  assert.match(dreams, /return src && !failed \? <img [^>]*onError=\{\(\) => setFailed\(true\)\} \/> : fallback \?\? null;/);
  assert.match(dreams, /\(\) => \{ pictures\.delete\(file\); if \(live\) setFailed\(true\); \}/, "a failed fetch shows the icon too");
  assert.match(dreams, /<WishPicture tripId=\{t\.id\} file=\{pic\.file\} whole=\{pic\.whole\} fallback=\{icon\} \/>/);
});
