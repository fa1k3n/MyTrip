import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyExamples } from "../src/seed.ts";

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "seed-"));
  const from = join(root, "examples"), to = join(root, "data");
  mkdirSync(join(from, "img"), { recursive: true });
  writeFileSync(join(from, "berlin.trip.json"), '{"title":"Berlin"}');
  writeFileSync(join(from, "img", "berlin.jpg"), "jpg");
  writeFileSync(join(from, "README.md"), "not a trip");
  return { from, to };
};

// REQ: DM-11 example trips and their images are copied into an empty data folder
test("DM-11 copies example trips and images", async () => {
  const { from, to } = setup();
  const r = await copyExamples(from, to);
  assert.deepEqual(r, { copied: ["berlin.trip.json", "img/berlin.jpg"], skipped: [] });
  assert.equal(readFileSync(join(to, "berlin.trip.json"), "utf8"), '{"title":"Berlin"}');
  assert.ok(existsSync(join(to, "img", "berlin.jpg")));
  assert.ok(!existsSync(join(to, "README.md")));
});

// REQ: DM-11 existing trips are never overwritten unless forced
test("DM-11 keeps existing files unless forced", async () => {
  const { from, to } = setup();
  mkdirSync(to);
  writeFileSync(join(to, "berlin.trip.json"), '{"title":"Mine"}');
  assert.deepEqual(await copyExamples(from, to), { copied: ["img/berlin.jpg"], skipped: ["berlin.trip.json"] });
  assert.equal(readFileSync(join(to, "berlin.trip.json"), "utf8"), '{"title":"Mine"}');
  await copyExamples(from, to, { force: true });
  assert.equal(readFileSync(join(to, "berlin.trip.json"), "utf8"), '{"title":"Berlin"}');
});
