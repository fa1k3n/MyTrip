import { test } from "node:test";
import assert from "node:assert/strict";
import { durationText, upDayTime, upTime } from "../src/upday.ts";
import { activityTitle, plainExpense } from "../src/money.ts";

// REQ: UP-36 no "ca" in Uppleva: times, lengths and the day's time
test("UP-36 upTime, durationText and upDayTime without ca", () => {
  assert.equal(upTime({ start: "18:15", estimated: true }), "18.15");
  assert.equal(upTime({ start: "09:00", estimated: false }), "09.00");
  assert.equal(upTime({ estimated: true }), "");
  assert.equal(durationText({ id: "x", start: "09:00", durationMin: 90, estimated: true }, false), "1 tim 30 min");
  assert.equal(durationText({ id: "x", start: "09:00", durationMin: 90, estimated: true }), "ca 1 tim 30 min"); // elsewhere it stays
  assert.equal(upDayTime({ start: "08:30", end: "17:00", estimated: false, endEstimated: true }), "08.30–17.00");
});

// REQ: MI-13 Summera's short form: category from the form, who paid as chosen
test("MI-13 plainExpense", () => {
  assert.deepEqual(plainExpense({ text: " Taxi ", amount: "120", category: "Transport" }, "bo", ["anna", "bo"]),
    { text: "Taxi", amount: "120", category: "Transport", paidBy: "bo", sharedBy: ["anna", "bo"], addedBy: "bo" });
});

// REQ: MI-14 an expense for an activity names the activity
test("MI-14 activityTitle", () => {
  const t = { days: [{ activities: [{ id: "a1", text: "Lunch i Lübeck" }] }, { activities: [{ id: "a2", text: "Stadsvandring" }] }] };
  assert.equal(activityTitle(t, { activityId: "a2" }), "Stadsvandring");
  assert.equal(activityTitle(t, { activityId: "gone" }), undefined);
  assert.equal(activityTitle(t, {}), undefined);
});
