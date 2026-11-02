import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyOps, Trip } from "@trip/schema";
import { aiCounts, keepAi, keepAllAi, removeAi } from "../src/aiReview.ts";
import { aiDoneText } from "../src/format.ts";
import { sv } from "../src/sv.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], bookings: [], days: [],
  travelers: [{ id: "olle", name: "Olle", age: 7, packing: ["Gosedjur", "Mössa"], packingAi: ["Gosedjur", "Mössa"], packed: ["Gosedjur"] }],
  packing: ["Laddare", "Regnjackor"], packingAi: ["Regnjackor"],
});

// REQ: AI-89 AI-83 an AI item on a packing list is kept (its mark goes) or removed at once, also when it was checked
test("AI-89 keep and remove a packing item", () => {
  const t = trip();
  const kept = Trip.parse(applyOps(t, keepAi(t, { kind: "packing", list: "olle", item: "Gosedjur" })));
  assert.deepEqual([kept.travelers[0]!.packing, kept.travelers[0]!.packingAi], [["Gosedjur", "Mössa"], ["Mössa"]]);
  const gone = Trip.parse(applyOps(t, removeAi(t, { kind: "packing", list: "olle", item: "Gosedjur" })));
  assert.deepEqual([gone.travelers[0]!.packing, gone.travelers[0]!.packingAi, gone.travelers[0]!.packed], [["Mössa"], ["Mössa"], []]);
  const shared = Trip.parse(applyOps(t, removeAi(t, { kind: "packing", list: "shared", item: "Regnjackor" })));
  assert.deepEqual([shared.packing, shared.packingAi], [["Laddare"], []]);
});

// REQ: AI-89 AI-84 Nytt från AI counts the AI packing items, and Behåll allt keeps them too
test("AI-89 counted and kept with the rest", () => {
  const t = trip();
  assert.equal(aiCounts(t).packing, 3);
  const all = Trip.parse(applyOps(t, keepAllAi(t)));
  assert.deepEqual([all.packingAi, all.travelers[0]!.packingAi, all.packing], [[], [], ["Laddare", "Regnjackor"]]);
  assert.equal(aiCounts(all).packing, undefined);
});

// REQ: AI-89 AI-76 AI-82 the packing lists are made after the draft, as a step of their own, and counted in the notice
test("AI-89 a step after the draft", () => {
  assert.match(readFileSync(new URL("../src/NewTrip.tsx", import.meta.url), "utf8"), /export const DRAFT_HELPERS = \["prep", "wishes", "packing"\] as const;/);
  assert.equal(sv.newTripAi.steps.packing, "Skriver packlistor");
  assert.equal(aiDoneText({ activities: 2, tasks: 0, bookings: 0, packing: 14 }), "AI är klar: 2 aktiviteter och 14 saker i packlistorna är inlagda. Ta bort det du inte vill ha.");
  assert.deepEqual(sv.aiRun.helpers.packing, ["Packlistor", "Skriver en gemensam packlista och en för varje resenär efter resans väder, aktiviteter och åldrar."]);
});

// REQ: AI-89 the lists show the AI mark with keep and remove, and the helper's suggestions per list
test("AI-89 in Packlista", () => {
  const side = readFileSync(new URL("../src/Side.tsx", import.meta.url), "utf8");
  assert.match(side, /ai\.includes\(it\) && <AiMark label=\{sv\.aiRun\.aiMade\} \/>/);
  assert.match(side, /<AiKeep item=\{\{ kind: "packing", list: l\.id, item: it \}\}/);
  assert.match(side, /useAiSuggestions\(t, !!review && part\("packing"\), "packing", null\)/);
  assert.match(side, /id="sec-packing"/);
});
