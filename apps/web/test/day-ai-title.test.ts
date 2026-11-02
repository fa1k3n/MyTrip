import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { saveDay, type DayInput } from "../src/edit.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "T", timezone: "Europe/Stockholm", stops: [], places: [], bookings: [], tasks: [], travelers: [],
  days: [{ id: "d1", date: "2026-10-25", title: "Hagenbeck och hamn", aiTitle: true, summary: "S.", icons: ["🦁"], start: "09:00", end: "18:00", activities: [] }],
});
const input = (x: Partial<DayInput> = {}): DayInput => ({
  date: "2026-10-25", title: "Hagenbeck och hamn", summary: "S.", icons: "🦁", start: "09:00", end: "18:00", startEstimated: false, endEstimated: false, location: "", ...x,
});
const run = (r: ReturnType<typeof saveDay>) => { assert.ok(r.ok); return Trip.parse(applyOps(trip(), r.ok ? r.ops : [])); };

// REQ: AI-86 a title a person changes is no longer an AI title; saving the day without changing it keeps the mark
test("AI-86 changing a day's title", () => {
  assert.equal(run(saveDay(trip(), input({ summary: "Ny." }), "d1")).days[0]!.aiTitle, true);
  assert.equal(run(saveDay(trip(), input({ title: "Djur och båtar" }), "d1")).days[0]!.aiTitle, undefined);
});
