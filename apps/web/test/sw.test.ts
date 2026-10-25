import { test } from "node:test";
import assert from "node:assert/strict";
import { swFiles, swSource } from "../sw-build.ts";

const bundle = ["index.html", "assets/index-AbC.js", "assets/index-AbC.css", "assets/Uppleva-XyZ.js", "assets/index-AbC.js.map"];

// REQ: PW-03 the service worker keeps every file the app needs, so it starts without a network
test("PW-03 the files the service worker keeps", () => {
  const files = swFiles(bundle);
  assert.deepEqual(files, ["/", "/assets/index-AbC.js", "/assets/index-AbC.css", "/assets/Uppleva-XyZ.js", "/manifest.webmanifest", "/icon-180.png", "/icon-192.png"]);
  const src = swSource(files);
  for (const f of files) assert.ok(src.includes(JSON.stringify(f)), f);
  assert.match(src, /\/api\//, "the API is left to the app, which keeps what each link received (PW-17)");
});

// REQ: PW-11 a new version gives a new service worker, which replaces the old one and its files
test("PW-11 each version has its own cache", () => {
  const a = swSource(swFiles(bundle)), b = swSource(swFiles(["index.html", "assets/index-New.js"]));
  const name = (s: string) => /const CACHE = "([^"]+)"/.exec(s)?.[1];
  assert.ok(name(a) && name(b) && name(a) !== name(b));
  assert.equal(name(a), name(swSource(swFiles(bundle))), "the same build gives the same name");
  assert.match(a, /skipWaiting/); assert.match(a, /caches\.delete/);
});
