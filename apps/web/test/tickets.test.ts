import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { checkPick, filesToKeep, fitSize, hasTickets, ticketFor } from "../src/tickets.ts";
import { swFiles } from "../sw-build.ts";
import { bookingTimes } from "../src/format.ts";
import { readingToForm, saveBooking, ticketActivities, type BookingInput } from "../src/edit.ts";

const f = (id: string) => ({ id, name: `${id}.pdf`, type: "application/pdf" as const, size: 10 });
const t = () => Trip.parse({
  id: "t", revision: 3, title: "T", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], travelers: [],
  days: [
    { id: "d1", date: "2026-10-25", title: "A", summary: "A", icons: ["🎢"], start: "09:00", end: "18:00", activities: [{ id: "lb", text: "Liseberg", placeIds: [] }, { id: "lunch", text: "Lunch", placeIds: [] }] },
    { id: "d2", date: "2026-10-26", title: "B", summary: "B", icons: ["🎢"], start: "09:00", end: "18:00", activities: [{ id: "zoo", text: "Zoo", placeIds: [] }] },
  ],
  bookings: [{ id: "tix", name: "Entré", from: "2026-10-25", to: "2026-10-25", status: "paid", kind: "ticket", activityId: "lb", files: [f("aaaaaaaaaaaaaaaa1")] },
    { id: "old", name: "Avbokad", from: "2026-10-26", to: "2026-10-26", status: "cancelled", activityId: "zoo", files: [f("bbbbbbbbbbbbbbbb1")] }],
});
const input = (x: Partial<BookingInput> = {}): BookingInput => ({
  name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-26", status: "paid", reference: "", placeId: "", kind: "stay",
  checkIn: "15:00", checkOut: "11:00", start: "", activityId: "", files: [], ...x,
});

// REQ: BK-07 the booking card shows the times after the dates
test("BK-07 booking times", () => {
  assert.equal(bookingTimes({ kind: "stay", checkIn: "15:00", checkOut: "11:00" }), "in 15.00 · ut 11.00");
  assert.equal(bookingTimes({ kind: "stay", checkOut: "11:00" }), "ut 11.00");
  assert.equal(bookingTimes({ kind: "ticket", start: "10:30" }), "kl. 10.30");
  assert.equal(bookingTimes({ kind: "other", start: "10:30" }), "");
  assert.equal(bookingTimes({}), "");
});

// REQ: BK-07 the form saves the kind and only the times that belong to it
test("BK-07 saving kind and times", () => {
  const r = saveBooking(t(), input());
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.ops[0], { op: "add", path: "bookings/-", value: {
    id: "hotell-kusten", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-26", status: "paid", kind: "stay", checkIn: "15:00", checkOut: "11:00" } });
  const tix = saveBooking(t(), input({ name: "Zoo", kind: "ticket", from: "2026-10-26", to: "2026-10-26", start: "10:00", activityId: "zoo" }));
  assert.ok(tix.ok);
  const v = tix.ok ? tix.ops[0]!.value as Record<string, unknown> : {};
  assert.deepEqual([v.kind, v.start, v.activityId, v.checkIn], ["ticket", "10:00", "zoo", undefined], "a ticket keeps no check-in");
  assert.ok(!saveBooking(t(), input({ checkIn: "3 pm" })).ok);
});

// REQ: BK-08 a Biljett can be linked to an activity on its first date only
test("BK-08 activities to link", () => {
  assert.deepEqual(ticketActivities(t(), "2026-10-25").map((a) => a.id), ["lb", "lunch"]);
  assert.deepEqual(ticketActivities(t(), "2026-11-01"), []);
  const r = saveBooking(t(), input({ kind: "ticket", from: "2026-10-26", to: "2026-10-26", activityId: "lb" }));
  assert.equal(r.ok ? "" : r.error, "Aktiviteten ligger inte på bokningens första datum.");
  const stay = saveBooking(t(), input({ activityId: "lb" }));
  assert.equal(stay.ok && (stay.ops[0]!.value as { activityId?: string }).activityId, undefined, "only a Biljett is linked");
  assert.deepEqual(ticketFor(t(), "lb")?.id, "tix");
  assert.equal(ticketFor(t(), "zoo"), undefined, "not a cancelled one");
  assert.equal(ticketFor(t(), "lunch"), undefined);
});

// REQ: BK-09 files are saved with the booking; removing one leaves it out
test("BK-09 files in the form", () => {
  const r = saveBooking(t(), input({ name: "Entré", kind: "ticket", from: "2026-10-25", to: "2026-10-25", files: [] }), "tix");
  assert.ok(r.ok);
  assert.equal(r.ok && (r.ops[0]!.value as { files?: unknown }).files, undefined);
  const r2 = saveBooking(t(), input({ files: [f("cccccccccccccccc1")] }));
  assert.deepEqual(r2.ok && (r2.ops[0]!.value as { files?: unknown }).files, [f("cccccccccccccccc1")]);
});

// REQ: BK-09 a picked file is uploaded, scaled down first when it is a large image, or refused
test("BK-09 checking a picked file", () => {
  assert.equal(checkPick({ type: "application/pdf", size: 1_000_000 }), "ok");
  assert.equal(checkPick({ type: "application/pdf", size: 3_000_000 }), "tooBig");
  assert.equal(checkPick({ type: "image/jpeg", size: 6_000_000 }), "scale");
  assert.equal(checkPick({ type: "image/heic", size: 1_000 }), "scale", "a phone photo becomes JPEG");
  assert.equal(checkPick({ type: "image/png", size: 1_000 }), "ok");
  assert.equal(checkPick({ type: "text/plain", size: 10 }), "type");
  assert.deepEqual(fitSize(4000, 3000, 2000), { w: 2000, h: 1500 });
  assert.deepEqual(fitSize(1000, 3000, 2000), { w: 667, h: 2000 });
  assert.deepEqual(fitSize(800, 600, 2000), { w: 800, h: 600 });
});

// REQ: BK-12 the phone keeps the files of the bookings of every trip it holds, and drops the rest
test("BK-12 files to keep", () => {
  const a = { bookings: [{ files: [f("x1x1x1x1x1x1x1x1")] }, {}] }, b = { bookings: [{ files: [f("y2y2y2y2y2y2y2y2"), f("x1x1x1x1x1x1x1x1")] }] };
  assert.deepEqual([...filesToKeep([[a], [b]])].sort(), ["x1x1x1x1x1x1x1x1", "y2y2y2y2y2y2y2y2"]);
  assert.deepEqual([...filesToKeep([])], []);
});

// REQ: BK-17 a proposal from a mail fills in the booking form; BK-18 a pasted text does the same through readBooking
test("BK-17 a reading fills the form", () => {
  const form = readingToForm(input({ name: "", kind: "other", checkIn: "", checkOut: "" }), { kind: "stay", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-26", checkIn: "15:00", reference: "KST-1", status: "cancelled" });
  assert.deepEqual(form, input({ kind: "stay", name: "Hotell Kusten", checkIn: "15:00", checkOut: "", reference: "KST-1", status: "cancelled" }));
  assert.deepEqual(readingToForm(input(), {}), input(), "nothing read: nothing changes");
  assert.equal(readingToForm(input(), { kind: "ticket", from: "2026-10-25", to: "2026-10-25" }).kind, "ticket");
});

// REQ: BK-10 a booking with ticket files has a ticket button; the PDF code is cached by the service worker, so tickets open offline
test("BK-10 tickets open, also offline", () => {
  assert.equal(hasTickets({ files: [f("aaaaaaaaaaaaaaaa1")] }), true);
  assert.equal(hasTickets({ files: [] }), false);
  assert.equal(hasTickets({}), false);
  const files = swFiles(["index.html", "assets/index-a.js", "assets/pdf-b.js", "assets/pdf.worker.min-c.mjs", "assets/pdf-b.js.map"]);
  assert.ok(files.includes("/assets/pdf-b.js") && files.includes("/assets/pdf.worker.min-c.mjs"));
});
