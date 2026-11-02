import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { applyOps } from "@trip/schema/src/ops.ts";
import { scheduleRows } from "../src/schedule.ts";
import { saveActivity, travelInput } from "../src/edit.ts";
import { aiDoneText } from "../src/format.ts";

const a = (id: string, start: string, durationMin: number, travel?: { vehicle: "walk" | "transit" | "car"; durationMin: number }) =>
  ({ id, text: id, placeIds: [], estimated: true, start, durationMin, ...(travel ? { travel } : {}) });

// REQ: TR-20 the gap and clash rows count the travel time to an activity
test("TR-20 scheduleRows with travel", () => {
  const kinds = (xs: ReturnType<typeof a>[]) => scheduleRows(xs).map((r) => (r.kind === "act" ? r.a.id : `${r.kind} ${r.min}`));
  assert.deepEqual(kinds([a("x", "10:00", 60), a("y", "11:20", 60, { vehicle: "walk", durationMin: 20 })]), ["x", "y"], "the 20 minutes between are the walk");
  assert.deepEqual(kinds([a("x", "10:00", 60), a("y", "11:10", 60, { vehicle: "transit", durationMin: 25 })]), ["x", "clash 15", "y"]);
  assert.deepEqual(kinds([a("x", "10:00", 60), a("y", "12:00", 60, { vehicle: "walk", durationMin: 15 })]), ["x", "gap 45", "y"]);
});

// REQ: TR-20 the activity form sets and removes the way to an activity
test("TR-20 saveActivity with travel", () => {
  const t = Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], places: [], bookings: [], tasks: [], travelers: [],
    days: [{ id: "d1", date: "2027-10-26", title: "Hamburg", summary: "S.", icons: ["Resa"], start: "09:00", end: "18:00", legs: [], activities: [a("zoo", "10:00", 180)] }] });
  const r = saveActivity(t, "d1", { start: "10:00", estimated: true, text: "zoo", place: { kind: "none" }, travel: travelInput("transit", "25") }, "zoo");
  assert.ok(r.ok);
  assert.deepEqual(applyOps(t, r.ops).days[0]!.activities[0]!.travel, { vehicle: "transit", durationMin: 25 });
  const off = saveActivity(applyOps(t, r.ops), "d1", { start: "10:00", estimated: true, text: "zoo", place: { kind: "none" }, travel: travelInput("", "") }, "zoo");
  assert.ok(off.ok);
  assert.equal(applyOps(t, off.ops).days[0]!.activities[0]!.travel, undefined);
  assert.equal(travelInput("walk", "x"), null, "a duration that is no number is rejected");
});

// REQ: AI-82 the notice says what the AI added
test("AI-82 aiDoneText", () => {
  assert.equal(aiDoneText({ activities: 6, tasks: 5, bookings: 1 }), "AI är klar: 6 aktiviteter, 5 uppgifter och 1 bokning att boka är inlagda. Ta bort det du inte vill ha.");
  assert.equal(aiDoneText({ activities: 1, tasks: 0, bookings: 0 }), "AI är klar: 1 aktivitet är inlagd. Ta bort det du inte vill ha.");
  assert.equal(aiDoneText({ activities: 0, tasks: 0, bookings: 0 }), "AI är klar men hittade inget mer att lägga in.");
});
