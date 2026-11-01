import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, pinBreaks, Trip, type Op } from "@trip/schema";
import { moveActivity } from "../src/schedule.ts";
import { removeActivity, saveActivity, togglePin } from "../src/edit.ts";
import { readProposal } from "../src/proposals.ts";
import { sv } from "../src/sv.ts";

const act = (id: string, start: string, more: object = {}) => ({ id, text: id, placeIds: [], start, durationMin: 60, estimated: false, category: "Mat", ...more });
const trip = () => Trip.parse({
  id: "t", revision: 3, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [
    { id: "d1", date: "2026-10-26", title: "Berlin", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00",
      activities: [act("farja", "09:00", { pinned: true, text: "Färja" }), act("zoo", "11:00", { estimated: true })] },
    { id: "d2", date: "2026-10-27", title: "Hem", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00", activities: [] },
  ],
  places: [], bookings: [], tasks: [], travelers: [],
});
const ok = (t: Trip, r: { ok: true; ops: Op[] } | { ok: false; error: string }) => { assert.ok(r.ok, r.ok ? "" : r.error); return Trip.parse(applyOps(t, r.ok ? r.ops : [])); };

test("ED-24 activities start unpinned, also in existing trips", () => {
  assert.equal(trip().days[0].activities[1].pinned, undefined);
});

test("ED-24 pinning gives a fixed time; unpinning keeps the time", () => {
  const t = ok(trip(), togglePin(trip(), "d1", "zoo"));
  const a = t.days[0].activities[1];
  assert.equal(a.pinned, true);
  assert.equal(a.estimated, false); // not "ca"
  const u = ok(t, togglePin(t, "d1", "zoo")).days[0].activities[1];
  assert.equal(u.pinned, undefined);
  assert.equal(u.start, "11:00");
  assert.equal(u.estimated, false);
});

test("ED-25 a pinned activity cannot be moved", () => {
  const r = moveActivity(trip(), "d1", "farja", "d2", 0);
  assert.deepEqual(r, { ok: false, error: sv.errors.pinned });
  assert.ok(moveActivity(trip(), "d1", "zoo", "d2", 0).ok); // others still move
});

test("ED-25 a pinned activity keeps its time and duration in the form, but its title can change", () => {
  const base = { estimated: false, text: "Färja", place: { kind: "none" as const }, category: "Mat", durationMin: 60 };
  assert.deepEqual(saveActivity(trip(), "d1", { ...base, start: "10:00" }, "farja"), { ok: false, error: sv.errors.pinned });
  assert.deepEqual(saveActivity(trip(), "d1", { ...base, start: "09:00", durationMin: 90 }, "farja"), { ok: false, error: sv.errors.pinned });
  assert.deepEqual(saveActivity(trip(), "d1", { ...base, start: "09:00", estimated: true }, "farja"), { ok: false, error: sv.errors.pinned });
  const t = ok(trip(), saveActivity(trip(), "d1", { ...base, start: "09:00", text: "Färja till Rostock" }, "farja"));
  assert.equal(t.days[0].activities[0].text, "Färja till Rostock");
  assert.equal(t.days[0].activities[0].pinned, true);
});

test("ED-25 a pinned activity cannot be removed", () => {
  assert.deepEqual(removeActivity(trip(), "d1", "farja"), []);
  assert.equal(removeActivity(trip(), "d1", "zoo").length, 1);
});

test("MC-20 a change that removes, moves, retimes or unpins a pinned activity disturbs its pin", () => {
  const t = trip(), set = (activities: unknown[], day = 0) => Trip.parse(applyOps(t, [{ op: "set", path: `days/${day}/activities`, value: activities }]));
  const [farja, zoo] = t.days[0].activities;
  assert.deepEqual(pinBreaks(t, set([farja, { ...zoo, start: "12:00" }])), []); // the unpinned one may move
  assert.deepEqual(pinBreaks(t, set([zoo])), ["Färja"]);
  assert.deepEqual(pinBreaks(t, set([{ ...farja, start: "09:30" }, zoo])), ["Färja"]);
  assert.deepEqual(pinBreaks(t, set([{ ...farja, durationMin: 30 }, zoo])), ["Färja"]);
  assert.deepEqual(pinBreaks(t, set([{ ...farja, estimated: true }, zoo])), ["Färja"]);
  assert.deepEqual(pinBreaks(t, set([{ ...farja, pinned: undefined }, zoo])), ["Färja"]);
  assert.deepEqual(pinBreaks(t, set([{ ...farja, text: "Färjan" }, zoo])), []); // the title may change
  const moved = Trip.parse(applyOps(set([zoo]), [{ op: "set", path: "days/1/activities", value: [farja] }]));
  assert.deepEqual(pinBreaks(t, moved), ["Färja"]);
});

test("MC-20 the proposal view cannot approve a proposal that disturbs a pin", () => {
  const t = trip();
  const r = readProposal(t, { id: "p", baseRevision: 3, reason: "", status: "pending", at: "2026-11-01T10:00:00Z", ops: [{ op: "remove", path: "days/0/activities/0" }] });
  assert.deepEqual(r.problems, [sv.proposal.pin("Färja")]);
});
