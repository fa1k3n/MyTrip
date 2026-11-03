import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { targetAfterAi } from "../src/edit.ts";

const t = Trip.parse({
  id: "t", revision: 1, title: "Hamburg", timezone: "Europe/Berlin", currency: "SEK", stops: [], places: [], tasks: [], travelers: [], budget: [],
  days: [{ id: "d1", date: "2027-11-01", title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [] }],
  bookings: [{ id: "pool", name: "Hotell med pool i Hamburg", from: "2027-11-01", to: "2027-11-05", status: "tobook", kind: "stay" }],
});

// REQ: BK-22 when "Läs med AI" fills in the dates the rules missed, the best "Att boka" match is chosen, unless the reviewer already chose
test("BK-22 the match is chosen after Läs med AI", () => {
  const r = { kind: "stay" as const, name: "Hotel Am Beispielkai", from: "2027-11-01", to: "2027-11-05" };
  assert.equal(targetAfterAi(t, r, "", false), "pool");
  assert.equal(targetAfterAi(t, r, "", true), "", "the reviewer chose Ny bokning");
  assert.equal(targetAfterAi(t, r, "pool", true), "pool");
  assert.equal(targetAfterAi(t, { ...r, from: "2027-12-01", to: "2027-12-02" }, "", false), "", "no overlap: none");
});
