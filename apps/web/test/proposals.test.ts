import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip, type Op } from "@trip/schema";
import { llmProposals, previewMarks, readProposal } from "../src/proposals.ts";
import { sv } from "../src/sv.ts";

const act = (id: string, start: string, durationMin = 60) => ({ id, text: id, placeIds: [], start, durationMin, estimated: false, category: "Mat" });
const trip = () => Trip.parse({
  id: "t", revision: 7, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [
    { id: "d1", date: "2026-10-26", title: "Berlin", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00", activities: [act("zoo", "09:00"), act("lunch", "12:00")] },
    { id: "d2", date: "2026-10-27", title: "Hem", summary: "S.", icons: ["🚗"], start: "09:00", end: "18:00", activities: [act("fika", "10:00")] },
  ],
  bookings: [{ id: "hotel", name: "Hotell", from: "2026-10-26", to: "2026-10-27", status: "paid" }],
  places: [], tasks: [], travelers: [],
});
const pending = (ops: Op[], baseRevision = 7) => ({ id: "p1", tripId: "t", baseRevision, ops, reason: "Planera måndagen", status: "pending" as const, at: "2026-11-01T10:00:00Z" });

test("MC-16 the changes are found by comparing the trip before and after, one row per item", () => {
  const t = trip();
  const r = readProposal(t, pending([
    { op: "set", path: "days/0/activities", value: [act("zoo", "09:00"), { ...act("museum", "14:00"), text: "Museum" }] }, // lunch removed, museum added
    { op: "set", path: "days/1/activities/0/start", value: "11:00" },
    { op: "set", path: "title", value: "Berlin igen" },
  ]));
  assert.deepEqual(r.problems, []);
  assert.equal(r.stale, false);
  assert.deepEqual(r.changes.map((c) => [c.kind, c.text]), [
    ["add", `${sv.proposal.kinds.activity}: Museum · mån 26 okt 14.00`],
    ["change", `${sv.proposal.kinds.activity}: fika · tis 27 okt 11.00`],
    ["remove", `${sv.proposal.kinds.activity}: lunch · mån 26 okt 12.00`],
    ["change", `${sv.proposal.kinds.title}: Berlin igen`], // AI-10: changed with the user's go-ahead (2026-11-02)
  ]);
});

test("MC-16 other lists are compared by id, with a name for each item", () => {
  const t = trip();
  const r = readProposal(t, pending([
    { op: "add", path: "tasks/-", value: { id: "boka", text: "Boka zoo", done: false } },
    { op: "remove", path: "bookings/0" },
  ]));
  assert.deepEqual(r.changes.map((c) => [c.kind, c.text]), [
    ["remove", `${sv.proposal.kinds.bookings}: Hotell`],
    ["add", `${sv.proposal.kinds.tasks}: Boka zoo`],
  ]);
});

test("MC-16 a proposal that breaks the schema or the checks shows its problems", () => {
  const t = trip();
  assert.ok(readProposal(t, pending([{ op: "set", path: "days/0/activities/0/dreamId", value: "nope" }])).problems.length > 0); // checkTrip
  assert.ok(readProposal(t, pending([{ op: "remove", path: "bookings/5" }])).problems.length > 0); // applyOps
  assert.ok(readProposal(t, pending([{ op: "set", path: "days/0/title", value: "" }])).problems.length > 0); // schema
});

test("MC-18 a proposal made for an older revision is stale", () => {
  assert.equal(readProposal(trip(), pending([], 6)).stale, true);
});

test("MC-15 only pending proposals that are not mail are listed", () => {
  const list = [pending([]), { ...pending([]), id: "p2", status: "approved" as const }, { ...pending([]), id: "p3", source: { kind: "mail" as const, from: "a", subject: "s", at: "x" } }];
  assert.deepEqual(llmProposals(list).map((p) => p.id), ["p1"]);
});

test("MC-17 the preview marks added, changed and removed activities per day", () => {
  const t = trip();
  const r = readProposal(t, pending([
    { op: "set", path: "days/0/activities", value: [act("zoo", "09:30"), act("museum", "14:00")] },
  ]));
  const m = previewMarks(t, r.next!);
  assert.deepEqual([...m.get("d1")!.marks], [["zoo", "change"], ["museum", "add"]]);
  assert.deepEqual(m.get("d1")!.removed.map((a) => a.id), ["lunch"]);
  assert.equal(m.has("d2"), false); // no changes, so it stays closed
});

test("MC-17 an activity moved to another day is changed there and not removed", () => {
  const t = trip();
  const r = readProposal(t, pending([
    { op: "set", path: "days/0/activities", value: [act("zoo", "09:00")] },
    { op: "set", path: "days/1/activities", value: [act("fika", "10:00"), act("lunch", "12:00")] },
  ]));
  const m = previewMarks(t, r.next!);
  assert.equal(m.has("d1"), false); // moved away, not removed
  assert.deepEqual([...m.get("d2")!.marks], [["lunch", "change"]]);
  assert.deepEqual(r.changes.map((c) => c.kind), ["change"]);
});
