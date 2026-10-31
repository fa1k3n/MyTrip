import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { albumOk, saveAlbum, experienced, memoryOps, minnasView, notesOf, verdictCounts } from "../src/memories.ts";
import { saveActivity } from "../src/edit.ts";
import { byDate, outcome, splitOps } from "../src/money.ts";
import { sv } from "../src/sv.ts";

const act = (id: string, text: string, extra: object = {}) => ({ id, text, placeIds: [], ...extra });
const day = (id: string, date: string, activities: object[]) => ({ id, date, title: `Dag ${id}`, summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities });
const dream = (id: string, title: string, extra: object = {}) => ({ id, title, category: "Aktivitet", source: "Tips", icon: "star", votes: 2, ...extra });
const trip = (extra: object = {}) => Trip.parse({
  id: "t", revision: 1, title: "t", timezone: "Europe/Berlin", stops: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }, { id: "cia", name: "Cia", packing: [] }],
  dreams: [dream("w-zoo", "Zoo"), dream("w-glass", "Glass"), dream("w-bad", "Badhus"), dream("w-dold", "Dold"), dream("w-aldrig", "Aldrig planerad"), dream("w-hemlig", "Hemlig", { hidden: true })],
  days: [
    day("d1", "2026-10-20", [act("a1", "Zoo", { dreamId: "w-zoo" }), act("a2", "Glass", { dreamId: "w-glass" }), act("a3", "Lunch")]),
    day("d2", "2026-10-21", [act("a4", "Dold", { hidden: true }), act("a5", "Zoo igen", { dreamId: "w-zoo" }), act("a7", "Hemlig", { dreamId: "w-hemlig" })]),
    day("d3", "2026-10-22", [act("a6", "Badhus", { dreamId: "w-bad" })]),
  ],
  ...extra,
});
const mem = (dreamId: string, by: string, verdict?: string, note?: string) => ({ id: `m-${dreamId}-${by}`, dreamId, by, ...(verdict ? { verdict } : {}), ...(note ? { note } : {}) });

// REQ: MI-15 the page is called Minnas, and opens on Minnen when the role may see memories, else on Budget, remembering the choice
test("MI-15 Minnas and its two views", () => {
  assert.equal(sv.tabs.mi, "Minnas");
  assert.deepEqual([sv.minnas.memories, sv.minnas.budget], ["Upplevt", "Pengar"]);
  assert.equal(minnasView(null, true), "minnen");
  assert.equal(minnasView(null, false), "budget");
  assert.equal(minnasView("budget", true), "budget", "the stored choice wins");
  assert.equal(minnasView("minnen", false), "budget", "not memories when the role may not see them");
  assert.equal(minnasView("rubbish", true), "minnen");
});

// REQ: MI-16 the experienced wishes: linked to an activity on a day up to today, once each, in Önska's order, not hidden ones
test("MI-16 experienced wishes", () => {
  const t = trip();
  assert.deepEqual(experienced(t, "2026-10-21").map((w) => w.id), ["w-zoo", "w-glass"]);
  assert.deepEqual(experienced(t, "2026-11-30").map((w) => w.id), ["w-zoo", "w-glass", "w-bad"], "unlinked and hidden wishes are left out");
  assert.deepEqual(experienced(t, "2026-10-19"), [], "nothing before the first day");
  const masked = trip({ days: [day("d1", "2026-10-20", [act("a1", "Dold", { hidden: true, dreamId: "w-zoo" })])] }); // a hidden activity does not make its wish experienced
  assert.deepEqual(experienced(masked, "2026-10-21"), []);
  assert.ok(sv.minnas.notYet.length > 0);
});

// REQ: MI-17 one verdict and one comment per traveler and wish; pressing the verdict again takes it back; empty memories are removed
test("MI-17 verdicts and comments in one's own name", () => {
  let t = trip();
  const step = (dreamId: string, by: string, change: { verdict?: "again" | "ok" | "never"; note?: string }) => {
    const r = memoryOps(t, dreamId, by, change);
    assert.ok(r.ok, JSON.stringify(r));
    t = Trip.parse(applyOps(t, r.ops));
  };
  step("w-zoo", "anna", { verdict: "again" });
  assert.deepEqual(t.memories, [mem("w-zoo", "anna", "again")]);
  step("w-zoo", "anna", { note: "  Lejonen sov, gå tidigare.  " });
  assert.deepEqual(t.memories, [mem("w-zoo", "anna", "again", "Lejonen sov, gå tidigare.")], "the same memory, the text trimmed");
  step("w-zoo", "anna", { verdict: "never" });
  assert.equal(t.memories[0].verdict, "never", "another verdict replaces it");
  step("w-zoo", "bo", { verdict: "ok" });
  step("w-zoo", "anna", { verdict: "never" });
  assert.deepEqual(t.memories.map((m) => [m.by, m.verdict, m.note]), [["anna", undefined, "Lejonen sov, gå tidigare."], ["bo", "ok", undefined]], "the same verdict again takes it back");
  step("w-zoo", "anna", { note: "" });
  assert.deepEqual(t.memories.map((m) => m.by), ["bo"], "neither verdict nor comment: removed");
  assert.equal(memoryOps(t, "w-zoo", "bo", { note: "x".repeat(141) }).ok, false);
  assert.equal(memoryOps(t, "w-zoo", "bo", { note: "x".repeat(140) }).ok, true);
});

// REQ: MI-18 the number of each verdict, never who; comments without names
test("MI-18 counts, not people", () => {
  const t = trip({ memories: [mem("w-zoo", "anna", "again", "Gå tidigt."), mem("w-zoo", "bo", "again"), mem("w-zoo", "cia", "never", "För trångt."), mem("w-bad", "anna", "ok")] });
  assert.deepEqual(verdictCounts(t, "w-zoo"), { again: 2, ok: 0, never: 1 });
  assert.deepEqual(verdictCounts(t, "w-glass"), { again: 0, ok: 0, never: 0 });
  assert.deepEqual(notesOf(t, "w-zoo"), ["Gå tidigt.", "För trångt."]);
  assert.deepEqual([sv.minnas.verdicts.again, sv.minnas.verdicts.ok, sv.minnas.verdicts.never], ["Igen", "Okej", "Inte igen"]);
});

// REQ: MI-19 an activity is linked to a wish in Nåla's form, or the link is removed
test("MI-19 linking an activity to a wish", () => {
  const t = trip();
  const base = { start: "", estimated: false, text: "Lunch", place: { kind: "none" as const } };
  const linked = saveActivity(t, "d1", { ...base, dreamId: "w-bad" }, "a3");
  assert.ok(linked.ok);
  const t2 = Trip.parse(applyOps(t, linked.ops));
  assert.equal(t2.days[0].activities.find((a) => a.id === "a3")?.dreamId, "w-bad");
  const unlinked = saveActivity(t2, "d1", { ...base, dreamId: "" }, "a3");
  assert.ok(unlinked.ok);
  assert.equal(Trip.parse(applyOps(t2, unlinked.ops)).days[0].activities.find((a) => a.id === "a3")?.dreamId, undefined);
  const kept = saveActivity(t2, "d1", base, "a3");
  assert.ok(kept.ok);
  assert.equal(Trip.parse(applyOps(t2, kept.ops)).days[0].activities.find((a) => a.id === "a3")?.dreamId, "w-bad", "undefined keeps the link");
});

// REQ: MI-20 the album link must be an https address
test("MI-20 album link", () => {
  assert.equal(albumOk("https://photos.example.org/album/abc"), true);
  for (const bad of ["http://photos.example.org/a", "photos.example.org", "", "javascript:alert(1)"]) assert.equal(albumOk(bad), false, bad);
  assert.equal(trip({ album: "https://photos.example.org/a" }).album, "https://photos.example.org/a");
  assert.throws(() => trip({ album: "http://photos.example.org/a" }));
  assert.deepEqual(saveAlbum(trip(), " https://photos.example.org/a "), { ok: true, ops: [{ op: "set", path: "album", value: "https://photos.example.org/a" }] });
  assert.equal(saveAlbum(trip(), "http://x.example.org").ok, false);
  assert.deepEqual(saveAlbum(trip({ album: "https://photos.example.org/a" }), ""), { ok: true, ops: [{ op: "remove", path: "album" }] }, "empty clears it");
  assert.deepEqual(saveAlbum(trip(), ""), { ok: true, ops: [] });
});

// REQ: MI-23 the outcome against the maximum budget, or the sum of expenses without one
test("MI-23 outcome against the maximum budget", () => {
  const ex = [{ id: "e1", text: "Mat", category: "Mat/Fritid", amount: 400, paidBy: "anna" }, { id: "e2", text: "Glass", category: "Mat/Fritid", amount: 100.5, paidBy: "bo" }];
  const budget = [{ id: "b1", category: "Boende", amount: 1000, paid: true }];
  assert.deepEqual(outcome(trip({ budgetMax: 2000, budget, expenses: ex })), { used: 1500.5, max: 2000, left: 499.5, percent: 75 });
  assert.deepEqual(outcome(trip({ budgetMax: 1000, budget, expenses: ex })), { used: 1500.5, max: 1000, left: -500.5, percent: 100 }, "the bar stops at full");
  assert.deepEqual(outcome(trip({ budget, expenses: ex })), { used: 500.5 });
});

// REQ: MI-24 expenses are listed by date and then by when they were added, never by amount
test("MI-24 expenses by date", () => {
  const e = (id: string, amount: number, date?: string, addedAt?: string) => ({ id, amount, ...(date ? { date } : {}), ...(addedAt ? { addedAt } : {}) });
  const list = [e("big", 900, "2026-10-21", "2026-10-21T10:00:00Z"), e("late", 5, "2026-10-21", "2026-10-21T18:00:00Z"), e("first", 50, "2026-10-20"), e("early", 10, "2026-10-21", "2026-10-21T08:00:00Z"), e("nodate", 1)];
  assert.deepEqual(byDate(list).map((x) => x.id), ["nodate", "first", "early", "big", "late"]);
});

// REQ: MI-25 who shares an expense is chosen per expense; at least one; everyone is stored as shared by all
test("MI-25 splitting an expense", () => {
  const t = trip({ expenses: [{ id: "e1", text: "Mat", category: "Mat/Fritid", amount: 300, paidBy: "anna", sharedBy: [] }] });
  const some = splitOps(t, "e1", ["bo", "anna"]);
  assert.ok(some.ok);
  assert.deepEqual(Trip.parse(applyOps(t, some.ops)).expenses[0].sharedBy, ["anna", "bo"], "in the travelers' order");
  const all = splitOps(t, "e1", ["cia", "bo", "anna"]);
  assert.ok(all.ok);
  assert.deepEqual(Trip.parse(applyOps(t, all.ops)).expenses[0].sharedBy, []);
  assert.equal(splitOps(t, "e1", []).ok, false);
  assert.equal(splitOps(t, "nope", ["anna"]).ok, false);
});
