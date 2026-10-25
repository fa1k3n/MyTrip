import { test } from "node:test";
import assert from "node:assert/strict";
import { adjacentDay, coveringStops } from "../src/today.ts";

const days = [
  { id: "d1", date: "2026-10-26" }, { id: "d2", date: "2026-10-27" }, { id: "d3", date: "2026-10-28" }, { id: "d4", date: "2026-10-29" },
];
const stops = [{ dayId: "d1" }, { dayId: "d1" }, { dayId: "d2" }, { dayId: "d4" }];

test("UP-08 a day without its own stop marks the stop of the closest earlier day", () => {
  assert.deepEqual(coveringStops({ days, stops }, "d3"), [2]);
  assert.deepEqual(coveringStops({ days, stops }, "d1"), [0, 1]); // a day with several stops marks them all
  assert.deepEqual(coveringStops({ days, stops }, "d4"), [3]);
  assert.deepEqual(coveringStops({ days, stops: [{ dayId: "d4" }] }, "d1"), []); // nothing before it
});

test("UP-09 the previous and next day, in date order, or none at the ends", () => {
  const shuffled = [days[2], days[0], days[3], days[1]];
  assert.equal(adjacentDay(shuffled, "d3", -1)?.id, "d2");
  assert.equal(adjacentDay(shuffled, "d3", 1)?.id, "d4");
  assert.equal(adjacentDay(shuffled, "d1", -1), undefined);
  assert.equal(adjacentDay(shuffled, "d4", 1), undefined);
});
