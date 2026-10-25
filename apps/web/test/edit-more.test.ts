import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import {
  addPacking, removeInfo, removePacking, removePlace, removeTask, saveBooking, saveBudgetItem, saveInfo, savePlace, saveTask, toggleTask,
} from "../src/edit.ts";
import { isOverdue } from "../src/today.ts";

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [],
  days: [{ id: "d1", date: "2026-10-27", title: "D", summary: "S.", icons: ["🚗"], start: "08:00", end: "17:00",
    activities: [{ id: "a1", text: "Lunch", placeIds: ["cafe", "tor"], estimated: false }] }],
  places: [{ id: "cafe", name: "Café", address: "Breite Str. 89" }, { id: "tor", name: "Holstentor", address: "Holstentorplatz" }],
  bookings: [{ id: "hotel", name: "Hotel", from: "2026-10-27", to: "2026-10-27", status: "paid", placeId: "cafe", note: "Frukost ingår." }],
  tasks: [{ id: "t1", text: "Boka biljetter", done: false, placeId: "cafe" }],
  travelers: [{ id: "vilda", name: "Vilda", age: 12, packing: ["Hörlurar"] }],
  info: [{ id: "garage", title: "Garage", text: "Max 2 m.", placeId: "cafe" }],
});
const run = (t: Trip, r: { ok: boolean; ops?: unknown[]; error?: string } | unknown[]) => {
  const ops = Array.isArray(r) ? r : (assert.ok(r.ok, r.error), r.ops!);
  return Trip.parse(applyOps(t, ops as never));
};

// REQ: TK-02 TK-03 checking a task is saved with the trip
test("TK-02 TK-03 toggleTask", () => {
  let t = run(trip(), toggleTask(trip(), "t1"));
  assert.equal(t.tasks[0].done, true);
  t = run(t, toggleTask(t, "t1"));
  assert.equal(t.tasks[0].done, false);
});

// REQ: TK-09 TK-07 tasks are added, changed and removed with text, due date and place
test("TK-09 TK-07 saveTask and removeTask", () => {
  let t = run(trip(), saveTask(trip(), { text: "Mät bilens höjd", due: "2026-10-20", placeId: "" }));
  assert.deepEqual(t.tasks[1], { id: "mat-bilens-hojd", text: "Mät bilens höjd", done: false, due: "2026-10-20" });
  t = run(t, saveTask(t, { text: "Boka Tropical Islands", due: "", placeId: "tor" }, "t1"));
  assert.deepEqual(t.tasks[0], { id: "t1", text: "Boka Tropical Islands", done: false, placeId: "tor" });
  assert.equal(saveTask(t, { text: " ", due: "", placeId: "" }).ok, false);
  t = run(t, removeTask(t, "t1"));
  assert.deepEqual(t.tasks.map((x) => x.id), ["mat-bilens-hojd"]);
});

// REQ: TK-08 a task past its due date is marked
test("TK-08 isOverdue", () => {
  assert.equal(isOverdue({ done: false, due: "2026-10-20" }, "2026-10-25"), true);
  assert.equal(isOverdue({ done: true, due: "2026-10-20" }, "2026-10-25"), false);
  assert.equal(isOverdue({ done: false, due: "2026-10-25" }, "2026-10-25"), false);
  assert.equal(isOverdue({ done: false }, "2026-10-25"), false);
});

// REQ: PL-17 place details can be changed; web addresses get https://
test("PL-17 savePlace", () => {
  const input = { name: "Café Niederegger", address: "Breite Str. 89, Lübeck", phone: "+49 451 5301127", notes: "Öppet 09–19.", website: "niederegger.de", bookingUrl: "", bookingLabel: "" };
  let t = run(trip(), savePlace(trip(), input, "cafe"));
  assert.deepEqual(t.places[0], { id: "cafe", name: "Café Niederegger", address: "Breite Str. 89, Lübeck", phone: "+49 451 5301127", notes: "Öppet 09–19.", website: "https://niederegger.de" });
  t = run(t, savePlace(t, { ...input, name: "Stena Line", website: "", bookingUrl: "https://www.stenaline.se/", bookingLabel: "Hantera bokning" }));
  assert.equal(t.places[2].id, "stena-line");
  assert.equal(t.places[2].bookingLabel, "Hantera bokning");
  assert.equal(savePlace(t, { ...input, address: "" }).ok, false);
  assert.equal(savePlace(t, { ...input, website: "inte en adress" }).ok, false);
});

// REQ: PL-17 removing a place removes every reference to it
test("PL-17 removePlace", () => {
  const t = run(trip(), removePlace(trip(), "cafe"));
  assert.deepEqual(t.places.map((p) => p.id), ["tor"]);
  assert.deepEqual(t.days[0].activities[0].placeIds, ["tor"]);
  assert.equal(t.bookings[0].placeId, undefined);
  assert.equal(t.tasks[0].placeId, undefined);
  assert.equal(t.info[0].placeId, undefined);
});

// REQ: BK-06 the booking note is edited with the booking
test("BK-06 saveBooking note", () => {
  const b = { name: "Hotel", from: "2026-10-27", to: "2026-10-27", status: "paid" as const, reference: "", placeId: "cafe" };
  assert.equal(run(trip(), saveBooking(trip(), b, "hotel")).bookings[0].note, "Frukost ingår."); // no note given: kept
  assert.equal(run(trip(), saveBooking(trip(), { ...b, note: "Familjerum." }, "hotel")).bookings[0].note, "Familjerum.");
  assert.equal(run(trip(), saveBooking(trip(), { ...b, note: "" }, "hotel")).bookings[0].note, undefined);
});

// REQ: BG-03 BG-06 BG-07 estimates, ranges, other currencies and unknown amounts
test("BG-03 BG-06 BG-07 saveBudgetItem with estimate", () => {
  let t = run(trip(), saveBudgetItem(trip(), { category: "Övrigt", amount: "75", paid: false, owner: "", estimate: true, amountMax: "100", currency: "EUR", note: "Parkering Berlin" }));
  assert.deepEqual(t.budget[0], { id: "ovrigt", category: "Övrigt", amount: 75, amountMax: 100, paid: false, estimate: true, currency: "EUR", note: "Parkering Berlin" });
  t = run(t, saveBudgetItem(t, { category: "Övrigt", amount: "", paid: false, owner: "", estimate: true, amountMax: "", currency: "SEK", note: "Bensin" }));
  assert.deepEqual(t.budget[1], { id: "ovrigt-2", category: "Övrigt", paid: false, estimate: true, note: "Bensin" }); // trip currency is not stored
  assert.equal(saveBudgetItem(t, { category: "Övrigt", amount: "", paid: false, owner: "", estimate: false, amountMax: "", currency: "SEK", note: "" }).ok, false);
  assert.equal(saveBudgetItem(t, { category: "Övrigt", amount: "100", paid: false, owner: "", estimate: true, amountMax: "50", currency: "SEK", note: "" }).ok, false);
});

// REQ: PI-01 PI-03 practical information cards are added, changed and removed
test("PI-01 PI-03 saveInfo and removeInfo", () => {
  let t = run(trip(), saveInfo(trip(), { title: "Hotellets garage", text: "Infartshöjd 1,8 m.", placeId: "", unsuitable: "Bilen är för hög.", verify: false }, "garage"));
  assert.deepEqual(t.info[0], { id: "garage", title: "Hotellets garage", text: "Infartshöjd 1,8 m.", unsuitable: "Bilen är för hög." });
  t = run(t, saveInfo(t, { title: "APCOA", text: "Öppet dygnet runt.", placeId: "tor", unsuitable: "", verify: true }));
  assert.deepEqual(t.info[1], { id: "apcoa", title: "APCOA", text: "Öppet dygnet runt.", placeId: "tor", verify: true });
  assert.equal(saveInfo(t, { title: "", text: "", placeId: "", unsuitable: "", verify: false }).ok, false);
  t = run(t, removeInfo(t, "garage"));
  assert.deepEqual(t.info.map((x) => x.id), ["apcoa"]);
});

// REQ: PK-07 items are added to and removed from the shared list and each traveler's list
test("PK-07 addPacking and removePacking", () => {
  let t = run(trip(), addPacking(trip(), "shared", " Pass "));
  t = run(t, addPacking(t, "vilda", "Bok till bilen"));
  assert.deepEqual([t.packing, t.travelers[0].packing], [["Pass"], ["Hörlurar", "Bok till bilen"]]);
  assert.equal(addPacking(t, "vilda", " ").ok, false);
  t = run(t, removePacking(t, "vilda", 0));
  t = run(t, removePacking(t, "shared", 0));
  assert.deepEqual([t.packing, t.travelers[0].packing], [[], ["Bok till bilen"]]);
});
