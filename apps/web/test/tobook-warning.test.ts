import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingsTint, toBook } from "../src/format.ts";
import { sv } from "../src/sv.ts";

// REQ: BK-34 bookings still to book are a less serious warning: the yellow tint while any is left, the count in the triangle's name
test("BK-34 bookings to book give the yellow warning", () => {
  const b = (status: string) => ({ status });
  assert.equal(toBook({ bookings: [b("tobook"), b("ready"), b("tobook"), b("cancelled")] }), 2);
  assert.equal(bookingsTint({ bookings: [b("tobook"), b("ready")] }), "caution");
  assert.equal(bookingsTint({ bookings: [b("ready"), b("paid"), b("cancelled")] }), "");
  assert.equal(bookingsTint({ bookings: [] }), "");
  assert.equal(sv.marks.toBook(1), "1 bokning att boka");
  assert.equal(sv.marks.toBook(3), "3 bokningar att boka");
});
