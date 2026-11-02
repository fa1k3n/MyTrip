import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { applyOps } from "@trip/schema/src/ops.ts";
import { statusBadge } from "../src/format.ts";
import { saveBooking } from "../src/edit.ts";
import { sv } from "../src/sv.ts";

// REQ: BK-20 a booking can be "Att boka", with its own terracotta badge, chosen in the form, and keeps the page where it is booked
test("BK-20 Att boka", () => {
  assert.equal(statusBadge("tobook"), "badge tobook");
  assert.equal(sv.badge.tobook, "att boka");
  assert.equal(sv.statuses.tobook, "Att boka");
  assert.equal(Object.keys(sv.statuses)[0], "tobook", "first in the form");
  const t = Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Stockholm", stops: [], days: [], places: [], tasks: [], travelers: [],
    bookings: [{ id: "hotell", name: "Hotell", from: "2027-10-26", to: "2027-10-27", status: "tobook", url: "https://example.com/boka", ai: true }] });
  const r = saveBooking(t, { name: "Hotell", from: "2027-10-26", to: "2027-10-27", status: "ready", reference: "", placeId: "" }, "hotell");
  assert.ok(r.ok);
  const b = applyOps(t, r.ops).bookings[0]!;
  assert.equal(b.status, "ready");
  assert.equal(b.url, "https://example.com/boka");
});
