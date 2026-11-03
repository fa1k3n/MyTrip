import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_BUILD, fullVersion } from "../src/version.ts";
import { sv } from "../src/sv.ts";

// REQ: US-42 a deploy's build id, the platform's commit, goes with the version as semver build metadata and shows in Tyck till
test("US-42 the version with the build id", () => {
  assert.equal(APP_BUILD, ""); // not built
  assert.equal(fullVersion("0.2.0", "1bca182a"), "0.2.0+1bca182a");
  assert.equal(fullVersion("0.2.0", ""), "0.2.0");
  assert.equal(sv.beta.version("0.2.0+1bca182a"), "Version 0.2.0 (1bca182a)");
  assert.equal(sv.beta.version("0.2.0"), "Version 0.2.0");
  const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.ok(config.includes("__APP_BUILD__") && config.includes("APP_BUILD"), "the build puts the build id in");
});
