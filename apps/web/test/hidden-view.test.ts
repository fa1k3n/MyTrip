import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { hiddenRows, pickedLabel } from "../src/hiddenView.ts";
import { dayTitle, stopLabel } from "../src/format.ts";

const t = Trip.parse({ id: "t", revision: 1, title: "T", timezone: "Europe/Stockholm", stops: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-26", title: "D", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [
    { id: "bil", text: "Bil till Liseberg", placeIds: [], start: "09:00", durationMin: 60 },
    { id: "lb", text: "Liseberg", placeIds: [], start: "10:00", durationMin: 240, hiddenFrom: ["anna", "bo"] },
    { id: "hem", text: "Bil hem", placeIds: [], start: "18:00", durationMin: 60 },
  ] }] });

// REQ: AU-25 the eye's dialog lists time, title, whom it is hidden from and the hidden activity it resembles
test("AU-25 hiddenRows for a day and for one activity", () => {
  assert.deepEqual(hiddenRows(t, "d1"), [
    { id: "bil", time: "09.00", text: "Bil till Liseberg", names: "Anna, Bo", like: "Liseberg" },
    { id: "lb", time: "10.00", text: "Liseberg", names: "Anna, Bo", like: "" },
  ]);
  assert.deepEqual(hiddenRows(t, "d1", "lb").map((r) => r.id), ["lb"]);
  assert.deepEqual(hiddenRows(t, "d1", "hem"), []);
  assert.deepEqual(hiddenRows(t, "okand"), []);
});

// REQ: AU-25 the dropdown shows the chosen names, or "Ingen"
test("AU-25 pickedLabel", () => {
  assert.equal(pickedLabel(t, []), "Ingen");
  assert.equal(pickedLabel(t, ["bo", "anna"]), "Anna, Bo");
});

// REQ: AU-27 the day's eye dialog lists the day's title when it is hidden
test("AU-27 hiddenRows lists a hidden day title first", () => {
  const u = structuredClone(t);
  u.days[0].title = "Till Liseberg";
  const rows = hiddenRows(u, "d1");
  assert.deepEqual(rows[0], { id: "", time: "", text: "Till Liseberg", names: "Anna, Bo", like: "Liseberg" });
  assert.equal(rows.length, 3);
  assert.deepEqual(hiddenRows(u, "d1", "lb").map((r) => r.id), ["lb"], "one activity's eye lists only that activity");
});

// REQ: AU-27 a day whose title is hidden shows "Dold rubrik", and so does an emptied timeline label
test("AU-27 dayTitle and stopLabel", () => {
  assert.equal(dayTitle({ title: "", hiddenTitle: true }), "Dold rubrik");
  assert.equal(dayTitle({ title: "Berlin" }), "Berlin");
  assert.equal(stopLabel({ label: "" }), "Dold rubrik");
  assert.equal(stopLabel({ label: "Berlin" }), "Berlin");
});
