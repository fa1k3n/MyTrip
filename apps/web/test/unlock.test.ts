import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { anyUnlocked, isUnlocked, LOCKED, toggleAllUnlock, toggleUnlock, unlockLabel } from "../src/format.ts";
import { saveActivity } from "../src/edit.ts";
import { sv } from "../src/sv.ts";

test("ED-18 every part of Nåla starts locked", () => {
  assert.equal(isUnlocked(LOCKED, "day:d1"), false);
  assert.equal(anyUnlocked(LOCKED), false);
});

test("ED-18 one part can be unlocked and locked again without touching the others", () => {
  const u = toggleUnlock(LOCKED, "day:d1");
  assert.equal(isUnlocked(u, "day:d1"), true);
  assert.equal(isUnlocked(u, "budget"), false);
  assert.equal(anyUnlocked(u), true);
  assert.equal(isUnlocked(toggleUnlock(u, "day:d1"), "day:d1"), false);
});

test("ED-18 the edit mode button unlocks everything, or locks everything when something is unlocked", () => {
  const all = toggleAllUnlock(LOCKED);
  assert.equal(isUnlocked(all, "day:d1") && isUnlocked(all, "packing"), true);
  const oneLocked = toggleUnlock(all, "budget");
  assert.equal(isUnlocked(oneLocked, "budget"), false);
  assert.equal(isUnlocked(oneLocked, "tasks"), true);
  assert.equal(anyUnlocked(toggleAllUnlock(oneLocked)), false);
  assert.equal(anyUnlocked(toggleAllUnlock(toggleUnlock(LOCKED, "info"))), false);
});

test("ED-18 a part's lock button names the part and what it does", () => {
  assert.equal(unlockLabel(false, "Budget"), `${sv.unlockPart} Budget`);
  assert.equal(unlockLabel(true, "Budget"), `${sv.lockPart} Budget`);
});

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [{ id: "d1", date: "2026-10-24", title: "K", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00",
    activities: [{ id: "a", text: "Avfärd", note: "Mölndal ca 07.15", placeIds: [], start: "06:30", durationMin: 60, estimated: false, category: "Resa" }] }],
  places: [], bookings: [], tasks: [], travelers: [],
});
const save = (t: Trip, note: string | undefined) => {
  const r = saveActivity(t, "d1", { start: "06:30", estimated: false, text: "Avfärd", place: { kind: "none" }, category: "Resa", durationMin: 60, note }, "a");
  assert.ok(r.ok);
  return Trip.parse(applyOps(t, r.ok ? r.ops : [])).days[0].activities[0];
};

test("ED-19 an activity has a short title and an optional note", () => {
  assert.equal(trip().days[0].activities[0].note, "Mölndal ca 07.15");
  assert.equal(save(trip(), undefined).note, "Mölndal ca 07.15"); // undefined keeps
  assert.equal(save(trip(), "  Räkna med trafik ").note, "Räkna med trafik");
  assert.equal(save(trip(), "").note, undefined); // empty removes
});
