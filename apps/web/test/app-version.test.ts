import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "../src/version.ts";
import { sv } from "../src/sv.ts";

// REQ: US-38 the beta dialog shows the app's version, taken from the web app's package when built; "dev" outside a build
test("US-38 the app's version", () => {
  assert.equal(APP_VERSION, "dev");
  assert.equal(sv.beta.version("0.2.0"), "Version 0.2.0");
  const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.ok(config.includes("__APP_VERSION__"), "the build puts the package's version in");
});
