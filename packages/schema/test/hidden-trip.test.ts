import { test } from "node:test";
import assert from "node:assert/strict";
import { hiddenFromIn, secretsOf, whoFor } from "../src/index.ts";

const t = { days: [
  { activities: [{ id: "a", text: "Liseberg", placeIds: ["lb"], hiddenFrom: ["anna"] }, { id: "b", text: "Bil till Liseberg", placeIds: [] }] },
  { activities: [{ id: "c", text: "Ullared", placeIds: [], hiddenFrom: ["bo"] }, { id: "d", text: "Zoo", placeIds: ["zoo"] }] },
] };

// REQ: AU-30 texts anywhere in the trip are compared with the activities hidden by choice
test("AU-30 whoFor compares with every activity hidden by choice", () => {
  assert.deepEqual(secretsOf(t).map((s) => [s.text, s.who]), [["Liseberg", ["anna"]], ["Ullared", ["bo"]]], "only hidden by choice");
  assert.deepEqual(whoFor(secretsOf(t), ["Biljetter till Liseberg"]), ["anna"]);
  assert.deepEqual(whoFor(secretsOf(t), ["Mat", "Shopping i Ullared"]), ["bo"], "any of the texts");
  assert.deepEqual(whoFor(secretsOf(t), ["Zoo", undefined]), []);
});

// REQ: AU-30 an activity whose note resembles a hidden activity is hidden by resemblance
test("AU-30 a note that resembles a hidden activity hides its activity", () => {
  const day = { activities: [
    { id: "a", text: "Liseberg", hiddenFrom: ["anna"] },
    { id: "b", text: "Bil", note: "Parkera vid Liseberg" },
    { id: "c", text: "Middag", note: "Boka bord" },
  ] };
  assert.deepEqual([...hiddenFromIn(day)], [["a", ["anna"]], ["b", ["anna"]]]);
});
