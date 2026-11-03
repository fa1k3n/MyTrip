import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { byDay, dismissOps, splitDismissed, tripFindings, undismissOps } from "../src/tripCheck.ts";

const t = () => Trip.parse({
  id: "t", revision: 1, title: "Hamburg", timezone: "Europe/Berlin", currency: "SEK", stops: [], places: [], tasks: [], travelers: [], budget: [], bookings: [],
  days: ["2027-11-01", "2027-11-02", "2027-11-03"].map((date, i) => ({ id: `d${i}`, date, title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [] })),
});
const at = "2027-10-01T10:00:00.000Z";

// REQ: DQ-11 a warning dismissed with a reason is left out of the level and listed apart with its reason
test("DQ-11 dismissing a warning", () => {
  const trip = t(), found = tripFindings(trip);
  assert.equal(found.length, 1);
  assert.ok(dismissOps(trip, found[0]!, " ", "Anna", at, found).length === 0, "a reason is needed");
  const next = Trip.parse(applyOps(trip, dismissOps(trip, found[0]!, "Vi sover hos mormor", "Anna", at, found)));
  assert.deepEqual(next.dismissed, [{ text: found[0]!.text, reason: "Vi sover hos mormor", by: "Anna", at }]);
  const s = splitDismissed(tripFindings(next), next.dismissed);
  assert.deepEqual([s.active.length, s.dismissed.map((x) => x.reason)], [0, ["Vi sover hos mormor"]]);
  const back = Trip.parse(applyOps(next, undismissOps(next, found[0]!.text)));
  assert.equal(splitDismissed(tripFindings(back), back.dismissed).active.length, 1, "taken back");
});

// REQ: DQ-11 a dismissed warning returns when the data behind it changes its text; dismissals no longer found are dropped at the next dismissal
test("DQ-11 a change brings it back", () => {
  const trip = t(), found = tripFindings(trip);
  const next = Trip.parse(applyOps(trip, dismissOps(trip, found[0]!, "Hos mormor", "Anna", at, found)));
  const longer = Trip.parse(applyOps(next, [{ op: "add", path: "days/-", value: { ...next.days[0]!, id: "d3", date: "2027-11-04" } }]));
  const s = splitDismissed(tripFindings(longer), longer.dismissed);
  assert.equal(s.active.length, 1, "Nätterna 1–4 nov is a new text");
  const again = Trip.parse(applyOps(longer, dismissOps(longer, s.active[0]!, "Ändå", "Anna", at, tripFindings(longer))));
  assert.deepEqual(again.dismissed?.map((d) => d.reason), ["Ändå"], "the stale one is dropped");
});

// REQ: DQ-11 the active warnings by day, for the marks on the day cards
test("DQ-11 warnings per day", () => {
  const f = [{ level: "caution" as const, dayId: "d1", text: "a" }, { level: "warn" as const, dayId: "d1", text: "b" }, { level: "caution" as const, dayId: "d2", text: "c" }];
  const m = byDay(f);
  assert.deepEqual([m.get("d1")?.level, m.get("d1")?.texts, m.get("d2")?.level, m.has("d0")], ["warn", ["a", "b"], "caution", false]);
});
