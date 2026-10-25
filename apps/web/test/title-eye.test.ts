import { test } from "node:test";
import assert from "node:assert/strict";
import { titleHiddenFrom } from "../src/format.ts";

const acts = [
  { id: "lb", text: "Liseberg", placeIds: [], start: "10:00", hiddenFrom: ["anna", "bo"] },
  { id: "zoo", text: "Zoo", placeIds: [], start: "15:00" },
];

// REQ: AU-29 a day title that resembles a hidden activity gets an eye naming whom it is hidden from
test("AU-29 titleHiddenFrom", () => {
  assert.deepEqual(titleHiddenFrom({ title: "Liseberg!", activities: acts }), ["anna", "bo"]);
  assert.deepEqual(titleHiddenFrom({ title: "Zoo i Göteborg", activities: acts }), []);
  // what a Resenär receives: the title is already replaced by "Dold rubrik", so no eye
  assert.deepEqual(titleHiddenFrom({ title: "", hiddenTitle: true, activities: [{ id: "lb", text: "" }] }), []);
});
