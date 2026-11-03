import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLevel, timeFindings, tripFindings, BUFFER_MIN } from "../src/tripCheck.ts";
import { sv } from "../src/sv.ts";

const act = (id: string, start: string | undefined, extra: object = {}) => ({ id, text: id, start, estimated: false, placeIds: [], ...extra });
const day = (acts: object[], extra: object = {}) => ({ id: "d1", date: "2027-11-01", start: "09:00", end: "18:00", activities: acts, ...extra });
const trip = (d: object, bookings: object[] = []) => ({ days: [d], bookings }) as never;

// REQ: DQ-09 a fixed time that cannot be reached after the activity before it and the way there is serious
test("DQ-09 a fixed time that cannot be reached", () => {
  const f = timeFindings(trip(day([act("Hamnrundtur", "12:00", { durationMin: 90 }), act("Wunderland", "13:45", { travel: { vehicle: "transit", durationMin: 30 } })])));
  assert.deepEqual(f.map((x) => [x.level, x.text]), [["warn", sv.check.late("Mån 1 nov", "Wunderland", "13.45", "Hamnrundtur", "13.30", "30 min")]]);
  assert.equal(sv.check.late("Mån 1 nov", "Wunderland", "13.45", "Hamnrundtur", "13.30", "30 min"), "Mån 1 nov: Wunderland 13.45 hinns inte. Hamnrundtur slutar 13.30 och vägen dit tar 30 min.");
  assert.equal(sv.check.late("Mån 1 nov", "B", "11.00", "A", "11.30"), "Mån 1 nov: B 11.00 hinns inte. A slutar 11.30.");
  assert.equal(checkLevel(f), "warn");
});

// REQ: DQ-09 an overlap where the later time is only approximate is less serious; an activity without a start, or after one without an end, is not checked
test("DQ-09 approximate times and unknown ends", () => {
  const f = timeFindings(trip(day([act("A", "10:00", { durationMin: 120 }), act("B", "11:00", { estimated: true, durationMin: 60 })])));
  assert.deepEqual(f.map((x) => [x.level, x.text]), [["caution", sv.check.lateCa("Mån 1 nov", "B", "11.00", "A", "12.00")]]);
  assert.equal(sv.check.lateCa("Mån 1 nov", "B", "11.00", "A", "12.00"), "Mån 1 nov: B ca 11.00 krockar med A, som slutar 12.00.");
  assert.deepEqual(timeFindings(trip(day([act("A", "10:00"), act("B", "10:15", { durationMin: 30 }), act("C", undefined)]))), [], "A has no end");
});

// REQ: DQ-10 two fixed times with less than the buffer between them, the way there counted, are less serious
test("DQ-10 too little buffer", () => {
  assert.equal(BUFFER_MIN, 15);
  const f = timeFindings(trip(day([act("A", "10:00", { durationMin: 60 }), act("B", "11:20", { travel: { vehicle: "walk", durationMin: 10 } })])));
  assert.deepEqual(f.map((x) => [x.level, x.text]), [["caution", sv.check.buffer("Mån 1 nov", "B", "11.20", "10 min")]]);
  assert.equal(sv.check.buffer("Mån 1 nov", "B", "11.20", "10 min"), "Mån 1 nov: bara 10 min marginal före B 11.20.");
  assert.deepEqual(timeFindings(trip(day([act("A", "10:00", { durationMin: 60 }), act("B", "11:15")]))), [], "exactly the buffer is enough");
  assert.deepEqual(timeFindings(trip(day([act("A", "10:00", { durationMin: 60, estimated: true }), act("B", "11:05")]))), [], "an approximate end has no buffer to keep");
});

// REQ: DQ-09 a day that ends before the check-in of its stay opens is less serious
test("DQ-09 a check-in after the day ends", () => {
  const stay = { id: "h", name: "Hotel Am Beispielkai", from: "2027-11-01", to: "2027-11-03", status: "ready", kind: "stay", checkIn: "15:00" };
  const f = timeFindings(trip(day([], { end: "13:00" }), [stay]));
  assert.deepEqual(f.map((x) => [x.level, x.text]), [["caution", sv.check.checkIn("Mån 1 nov", "Hotel Am Beispielkai", "15.00", "13.00")]]);
  assert.equal(sv.check.checkIn("Mån 1 nov", "H", "15.00", "13.00"), "Mån 1 nov: incheckningen på H öppnar 15.00, men dagen slutar 13.00.");
  assert.deepEqual(timeFindings(trip(day([], { end: "18:00" }), [stay])), []);
  assert.deepEqual(timeFindings(trip(day([], { end: "13:00" }), [{ ...stay, status: "cancelled" }])), []);
});

// REQ: DQ-09 the card lists the serious first, then by day
test("DQ-09 all findings in order", () => {
  const t = { days: [day([act("A", "10:00", { durationMin: 120 }), act("B", "11:00", { estimated: true })]), { ...day([act("C", "10:00", { durationMin: 120 }), act("D", "11:00")]), id: "d2", date: "2027-11-02" }], bookings: [] } as never;
  assert.deepEqual(tripFindings(t).map((f) => [f.level, f.dayId]), [["warn", "d1"], ["warn", "d2"], ["caution", "d1"]]);
});
