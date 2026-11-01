import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swFiles, swSource } from "../sw-build.ts";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// REQ: UI-12 the app is called Basläger in the page, the manifest, the home screen and notices
test("UI-12 the app is called Basläger", () => {
  const html = read("index.html");
  assert.match(html, /<title>Basläger<\/title>/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Basläger"/);
  const m = JSON.parse(read("public/manifest.webmanifest"));
  assert.deepEqual([m.name, m.short_name], ["Basläger", "Basläger"]);
  const sw = swSource(swFiles(["index.html"]));
  assert.match(sw, /n\.title \|\| "Basläger"/, "a notice without a title");
  assert.doesNotMatch(html + JSON.stringify(m) + sw, /MyTrip|Vår Resa/);
});

// REQ: UI-12 names stored on the device keep their old prefix, so stored links survive the rename
test("UI-12 stored names keep the mytrip. prefix", () => {
  assert.match(read("src/access.ts"), /const COOKIE = "mytrip\.link"/);
  assert.match(read("src/api.ts"), /LINKS_KEY = "mytrip\.links"/);
  assert.match(swSource(swFiles(["index.html"])), /const CACHE = "mytrip-/);
});
