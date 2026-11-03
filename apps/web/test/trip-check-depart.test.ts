import { test } from "node:test";
import assert from "node:assert/strict";
import { departFindings } from "../src/tripCheck.ts";
import { sv } from "../src/sv.ts";

const act = (id: string, start: string, extra: object = {}) => ({ id, text: id, start, estimated: false, placeIds: [], ...extra });
const ferry = { id: "f", name: "Färjan", from: "2027-11-01", to: "2027-11-01", status: "ready", kind: "transport", start: "14:30", origin: "Puttgarden" };
const trip = (acts: object[], bookings: object[] = [ferry], legs: object[] = [], rules?: object) =>
  ({ days: [{ id: "d1", date: "2027-11-01", start: "09:00", end: "18:00", activities: acts, legs }], bookings, ...(rules ? { rules } : {}) }) as never;

// REQ: DQ-13 a departure before the activity before it ends is serious
test("DQ-13 a departure that cannot be reached", () => {
  const f = departFindings(trip([act("Lunch", "13:00", { durationMin: 120 })]));
  assert.deepEqual(f.map((x) => [x.level, x.text]), [["warn", sv.check.departLate("Mån 1 nov", "Färjan", "14.30", "Lunch", "15.00")]]);
  assert.equal(sv.check.departLate("Mån 1 nov", "Färjan", "14.30", "Lunch", "15.00"), "Mån 1 nov: Färjan går 14.30, men Lunch slutar 15.00.");
  assert.deepEqual(departFindings(trip([act("Lunch", "13:00", { durationMin: 120 })], [{ ...ferry, status: "cancelled" }])), [], "cancelled");
  assert.deepEqual(departFindings(trip([act("Ombord", "14:30", { durationMin: 45 })])), [], "what starts at the departure is the trip itself");
});

// REQ: DQ-13 less than the trip's buffer before a departure is less serious; a leg with a departure time is checked too
test("DQ-13 too little buffer before a departure", () => {
  const f = departFindings(trip([act("Lunch", "13:00", { durationMin: 80 })]));
  assert.deepEqual(f.map((x) => [x.level, x.text]), [["caution", sv.check.departBuffer("Mån 1 nov", "Färjan", "14.30", "10 min")]]);
  assert.equal(sv.check.departBuffer("Mån 1 nov", "Färjan", "14.30", "10 min"), "Mån 1 nov: bara 10 min marginal före Färjan 14.30.");
  assert.deepEqual(departFindings(trip([act("Lunch", "13:00", { durationMin: 80 })], [ferry], [], { bufferMin: 5 })), [], "the trip's own buffer");
  const leg = departFindings(trip([act("Museum", "10:00", { durationMin: 120 })], [], [{ vehicle: "train", origin: "Hamburg", destination: "Berlin", departure: "11:45", waypoints: [] }]));
  assert.deepEqual(leg.map((x) => [x.level, x.text]), [["warn", sv.check.departLate("Mån 1 nov", "Hamburg → Berlin", "11.45", "Museum", "12.00")]]);
});
