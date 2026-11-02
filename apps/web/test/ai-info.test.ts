import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { aiCounts, keepAi, keepAllAi, removeAi } from "../src/aiReview.ts";
import { aiDoneText } from "../src/format.ts";

const trip = () => Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], travelers: [], places: [], bookings: [], tasks: [], days: [],
  info: [{ id: "p1", title: "Parkhaus am Hafen", text: "Max 2,0 m.", verify: true, ai: true }, { id: "egen", title: "Egen anteckning", text: "" }] });
const run = (t: Trip, ops: ReturnType<typeof keepAi>) => Trip.parse(applyOps(t, ops));

// REQ: AI-87 an AI info card counts in "Nytt från AI" and can be kept or removed like the other AI items
test("AI-87 reviewing an AI info card", () => {
  assert.equal(aiCounts(trip()).info, 1);
  assert.equal(run(trip(), keepAi(trip(), { kind: "info", id: "p1" })).info[0]!.ai, undefined);
  assert.equal(run(trip(), keepAllAi(trip())).info[0]!.ai, undefined);
  assert.deepEqual(run(trip(), removeAi(trip(), { kind: "info", id: "p1" })).info.map((x) => x.id), ["egen"]);
});

// REQ: AI-87 the notice of AI-82 counts the info cards
test("AI-87 the notice counts info cards", () => {
  assert.match(aiDoneText({ activities: 0, tasks: 2, bookings: 0, info: 3 }), /2 uppgifter och 3 kort i Praktisk info/);
  assert.match(aiDoneText({ activities: 0, tasks: 0, bookings: 0, info: 1 }), /1 kort i Praktisk info är inlagt/);
});
