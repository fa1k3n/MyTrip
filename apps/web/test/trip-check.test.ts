import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLevel, nightFindings } from "../src/tripCheck.ts";
import { sv } from "../src/sv.ts";

const days = (...dates: string[]) => dates.map((date, i) => ({ id: `d${i}`, date }));
const trip = (bookings: object[]) => ({ days: days("2027-11-01", "2027-11-02", "2027-11-03", "2027-11-04", "2027-11-05"), bookings: bookings as never });
const stay = (from: string, to: string, extra: object = {}) => ({ id: `b${from}`, name: "Hotell", from, to, status: "ready", kind: "stay", ...extra });

// REQ: DQ-08 every night of the trip without a stay is named, consecutive nights together; the last day's night is at home
test("DQ-08 nights without a stay", () => {
  assert.deepEqual(nightFindings(trip([])).map((f) => [f.level, f.text]), [["warn", sv.check.noStay("1–5 nov", 4)]]);
  const some = nightFindings(trip([stay("2027-11-02", "2027-11-04")]));
  assert.deepEqual(some.map((f) => [f.level, f.text, f.dayId]), [["warn", sv.check.noStay("1–2 nov", 1), "d0"], ["warn", sv.check.noStay("4–5 nov", 1), "d3"]]);
  assert.deepEqual(nightFindings(trip([stay("2027-11-01", "2027-11-05")])), [], "all nights covered");
  assert.equal(checkLevel([]), "ok");
});

// REQ: DQ-08 a night covered only by a stay still to book is the less serious warning; cancelled stays and tickets cover nothing; an overnight transport and an old booking without a kind over a night do
test("DQ-08 what covers a night", () => {
  const f = nightFindings(trip([stay("2027-11-01", "2027-11-03", { status: "tobook" }), stay("2027-11-03", "2027-11-05", { status: "cancelled" })]));
  assert.deepEqual(f.map((x) => [x.level, x.text]), [["caution", sv.check.toBook("1–3 nov", 2)], ["warn", sv.check.noStay("3–5 nov", 2)]]);
  assert.equal(checkLevel(f), "warn");
  assert.equal(checkLevel(f.filter((x) => x.level === "caution")), "caution");
  const other = nightFindings(trip([stay("2027-11-01", "2027-11-03", { kind: "ticket" }), stay("2027-11-03", "2027-11-04", { kind: "transport" }), stay("2027-11-04", "2027-11-05", { kind: undefined })]));
  assert.deepEqual(other.map((x) => x.text), [sv.check.noStay("1–3 nov", 2)]);
  assert.deepEqual(nightFindings({ days: days("2027-11-01"), bookings: [] }), [], "a day trip has no nights");
});

// REQ: DQ-08 nights across a month and the texts
test("DQ-08 texts", () => {
  const f = nightFindings({ days: days("2027-10-31", "2027-11-01"), bookings: [] });
  assert.equal(f[0]!.text, "Natten 31 okt–1 nov saknar boende.");
  assert.equal(sv.check.noStay("1–5 nov", 4), "Nätterna 1–5 nov saknar boende.");
  assert.equal(sv.check.toBook("1–3 nov", 2), "Nätterna 1–3 nov: boendet är inte bokat än.");
  assert.equal(sv.check.toBook("1–2 nov", 1), "Natten 1–2 nov: boendet är inte bokat än.");
});
