import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/CatIcon.tsx", import.meta.url), "utf8");

// REQ: UI-08 the 📅 of a day added from the trip's dates is drawn as a line icon with a name, never as the system's emoji
test("UI-08 an empty day's 📅 is a line icon", () => {
  assert.match(src, /"📅": \{ shape: "calendar", color: TAUPE, label: "Dag" \}/);
  assert.match(src, /^ {2}calendar: '<path/m, "the shape is drawn");
});
