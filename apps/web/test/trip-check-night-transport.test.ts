import { test } from "node:test";
import assert from "node:assert/strict";
import { nightFindings } from "../src/tripCheck.ts";
import { sv } from "../src/sv.ts";

const days = ["2027-11-01", "2027-11-02", "2027-11-03"].map((date, i) => ({ id: `d${i}`, date }));
const b = (from: string, to: string, kind: string) => ({ from, to, status: "ready", kind });

// REQ: DQ-08 a Resa covers a night only when it goes over exactly one night, as a night ferry; a round trip over several days covers none
test("DQ-08 only an overnight trip covers a night", () => {
  assert.deepEqual(nightFindings({ days, bookings: [b("2027-11-01", "2027-11-03", "transport")] }).map((f) => f.text), [sv.check.noStay("1–3 nov", 2)]);
  assert.deepEqual(nightFindings({ days, bookings: [b("2027-11-01", "2027-11-02", "transport"), b("2027-11-02", "2027-11-03", "stay")] }), []);
});
