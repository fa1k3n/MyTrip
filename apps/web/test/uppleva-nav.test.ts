import { test } from "node:test";
import assert from "node:assert/strict";
import { adjacentDay } from "../src/today.ts";

const days = [
  { id: "d1", date: "2026-10-26" }, { id: "d2", date: "2026-10-27" }, { id: "d3", date: "2026-10-28" }, { id: "d4", date: "2026-10-29" },
];

test("UP-09 the previous and next day, in date order, or none at the ends", () => {
  const shuffled = [days[2], days[0], days[3], days[1]];
  assert.equal(adjacentDay(shuffled, "d3", -1)?.id, "d2");
  assert.equal(adjacentDay(shuffled, "d3", 1)?.id, "d4");
  assert.equal(adjacentDay(shuffled, "d1", -1), undefined);
  assert.equal(adjacentDay(shuffled, "d4", 1), undefined);
});
