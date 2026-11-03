import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { loadFindings, timeFindings } from "../src/tripCheck.ts";
import { rulesForm, saveRules } from "../src/edit.ts";
import { sv } from "../src/sv.ts";

const act = (id: string, start: string | undefined, extra: object = {}) => ({ id, text: id, start, estimated: false, placeIds: [], ...extra });
const leg = (origin: string, destination: string, durationMin: number, vehicle = "car") => ({ vehicle, origin, destination, durationMin, waypoints: [] });
const day = (acts: object[], legs: object[] = [], extra: object = {}) => ({ id: "d1", date: "2027-11-01", start: "09:00", end: "18:00", activities: acts, legs, ...extra });
const trip = (d: object, rules?: object) => ({ days: [d], bookings: [], ...(rules ? { rules } : {}) }) as never;

// REQ: DQ-06 a day whose activities and travel take longer than the day is less serious; the larger of the legs and the ways to activities counts as its travel
test("DQ-06 a day too full", () => {
  const full = day([act("A", "09:00", { durationMin: 240 }), act("B", undefined, { durationMin: 250, travel: { vehicle: "car", durationMin: 60 } })], [leg("Hamburg", "Lübeck", 45)]);
  assert.deepEqual(loadFindings(trip(full)).map((f) => [f.level, f.text]), [["caution", sv.check.full("Mån 1 nov", "9 h 10 min", "9 h")]]);
  assert.equal(sv.check.full("Mån 1 nov", "9 h 30 min", "9 h"), "Mån 1 nov: dagen är för full. Aktiviteter och resor tar 9 h 30 min, dagen är 9 h.");
  assert.deepEqual(loadFindings(trip(day([act("A", "09:00", { durationMin: 240 })], [leg("Hamburg", "Lübeck", 60)]))), [], "fits");
  assert.deepEqual(loadFindings(trip(day([act("A", "09:00", { end: "18:00" })]))), [], "exactly the day is not too full");
});

// REQ: DQ-07 travel over the trip's maximum per day (any means but walking), or one car stretch over its maximum without a break, is less serious; nothing without the rules
test("DQ-07 travel and driving", () => {
  const d = day([act("Wunderland", "15:00", { travel: { vehicle: "car", durationMin: 150 } })], [leg("Malmö", "Hamburg", 200), leg("Puttgarden", "Rödby", 45, "ferry"), leg("Hotell", "Hamn", 30, "walk")]);
  assert.deepEqual(loadFindings(trip(d)), [], "no rules: not checked");
  const f = loadFindings(trip(d, { maxTravelDayMin: 240, maxDriveStretchMin: 180 }));
  assert.deepEqual(f.map((x) => [x.level, x.text]), [
    ["caution", sv.check.travel("Mån 1 nov", "4 h 5 min", "4 h")], // 200 + 45 by ferry, not the walk
    ["caution", sv.check.stretch("Mån 1 nov", "Malmö → Hamburg", "3 h 20 min", "3 h")],
  ]);
  assert.equal(sv.check.travel("Mån 1 nov", "4 h 5 min", "4 h"), "Mån 1 nov: 4 h 5 min restid, mer än 4 h per dag.");
  assert.equal(sv.check.stretch("Mån 1 nov", "Malmö → Hamburg", "3 h 20 min", "3 h"), "Mån 1 nov: Malmö → Hamburg är 3 h 20 min bilkörning i sträck, mer än 3 h utan paus.");
  const train = loadFindings(trip(day([], [leg("Hamburg", "Berlin", 200, "train")]), { maxTravelDayMin: 180, maxDriveStretchMin: 60 }));
  assert.deepEqual(train.map((x) => x.text), [sv.check.travel("Mån 1 nov", "3 h 20 min", "3 h")], "a train counts as travel, not as driving");
  const way = loadFindings(trip(day([act("Wunderland", "15:00", { travel: { vehicle: "car", durationMin: 200 } })]), { maxDriveStretchMin: 180 }));
  assert.deepEqual(way.map((x) => x.text), [sv.check.stretch("Mån 1 nov", sv.check.wayTo("Wunderland"), "3 h 20 min", "3 h")]);
  assert.equal(sv.check.wayTo("Wunderland"), "vägen till Wunderland");
});

// REQ: DQ-10 DM-15 the trip's own buffer replaces the 15 minutes; 0 turns it off
test("DQ-10 the trip's buffer", () => {
  const d = day([act("A", "10:00", { durationMin: 60 }), act("B", "11:20")]);
  assert.equal(timeFindings(trip(d)).length, 0);
  assert.equal(timeFindings(trip(d, { bufferMin: 30 })).length, 1);
  assert.equal(timeFindings(trip(day([act("A", "10:00", { durationMin: 60 }), act("B", "11:05")]), { bufferMin: 0 })).length, 0);
});

// REQ: DM-15 the planning rules are set, changed and cleared in the trip's settings: hours of driving, minutes of buffer
test("DM-15 saving the planning rules", () => {
  const t = Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Berlin", stops: [], places: [], tasks: [], travelers: [], bookings: [], days: [] });
  assert.deepEqual(rulesForm(t), { day: "", stretch: "", buffer: "" });
  const r = saveRules(t, { day: "5,5", stretch: "2", buffer: "20" });
  assert.ok(r.ok);
  const next = Trip.parse(applyOps(t, r.ok ? r.ops : []));
  assert.deepEqual(next.rules, { maxTravelDayMin: 330, maxDriveStretchMin: 120, bufferMin: 20 });
  const fromAi = Trip.parse(applyOps(t, [{ op: "set", path: "rules", value: { maxTravelDayMin: 180, ai: true } }]));
  const edited = saveRules(fromAi, { ...rulesForm(fromAi), buffer: "30" });
  assert.deepEqual(edited.ok && edited.ops, [{ op: "set", path: "rules", value: { maxTravelDayMin: 180, bufferMin: 30 } }], "saved by hand: no longer marked as AI");
  assert.deepEqual(rulesForm(next), { day: "5,5", stretch: "2", buffer: "20" });
  const cleared = saveRules(next, { day: "", stretch: "", buffer: "" });
  assert.deepEqual(cleared.ok && cleared.ops, [{ op: "remove", path: "rules" }]);
  assert.ok(!saveRules(t, { day: "mycket", stretch: "", buffer: "" }).ok);
  assert.ok(!saveRules(t, { day: "0", stretch: "", buffer: "" }).ok, "no driving at all is no rule");
  assert.ok(!saveRules(t, { day: "", stretch: "", buffer: "-5" }).ok);
});
