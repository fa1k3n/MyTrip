// SP-12: zod runs without eval (jitless), so the strict content security policy reports no blocked eval in the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Trip } from "../src/index.ts";

const src = join(import.meta.dirname, "..", "src");

test("SP-12: the schema package turns on zod's jitless mode", () => {
  assert.ok(Trip);
  assert.equal(z.config().jitless, true);
});

test("SP-12: every schema file takes zod from zod.ts, so jitless is set before any schema is built", () => {
  for (const f of readdirSync(src).filter((x) => x.endsWith(".ts") && x !== "zod.ts")) {
    assert.doesNotMatch(readFileSync(join(src, f), "utf8"), /from "zod"/, f);
  }
});
