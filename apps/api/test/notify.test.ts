import { test } from "node:test";
import assert from "node:assert/strict";
import { describeChange, noticeBody } from "../src/notify.ts";

const day = (activities: { id: string; text: string; placeIds?: string[]; start?: string; hidden?: boolean }[]) => ({ id: "d1", date: "2026-10-24", title: "Dag", summary: "", activities });
const base = {
  days: [day([{ id: "a1", text: "Zoo", placeIds: [], start: "10:00" }])],
  expenses: [{ id: "e0", text: "Bensin", amount: 500 }, { id: "e9", text: "Taxi", amount: 120, pending: true }],
  bookings: [], tasks: [{ id: "k1", text: "Boka", done: false }], info: [], dreams: [], payments: [], currency: "SEK",
};
const withs = (patch: object) => ({ ...base, ...patch });

// REQ: NT-01 a notice names who did what: expenses, activities and other things added
test("NT-01 describeChange", () => {
  assert.deepEqual(describeChange(base, withs({ expenses: [...base.expenses, { id: "e1", text: "Glass", amount: 60, pending: true }] }), "Bo"),
    ["Bo lade till en utgift: Glass, 60 kr (väntar på godkännande)"]);
  assert.deepEqual(describeChange(base, withs({ expenses: [base.expenses[0], { ...base.expenses[1], pending: undefined }] }), "Anna"), ["Anna godkände utgiften Taxi"]);
  assert.deepEqual(describeChange(base, withs({ expenses: [base.expenses[0]] }), "Anna"), ["Anna avvisade utgiften Taxi"]);
  assert.deepEqual(describeChange(base, withs({ days: [day([...base.days[0].activities, { id: "a2", text: "Liseberg", placeIds: [], start: "14:00" }])] }), "Anna"),
    ["Anna lade till Liseberg, lör 24 okt"]);
  assert.deepEqual(describeChange(base, withs({ days: [day([{ id: "a1", text: "Zoo", placeIds: [], start: "11:00" }])] }), "Anna"), ["Anna ändrade Zoo, lör 24 okt"]);
  assert.deepEqual(describeChange(base, withs({ days: [day([])] }), "Anna"), ["Anna tog bort Zoo, lör 24 okt"]);
  assert.deepEqual(describeChange(base, withs({ bookings: [{ id: "b", name: "Hotell" }], tasks: [...base.tasks, { id: "k2", text: "Packa", done: false }],
    info: [{ id: "i", title: "Parkering" }], dreams: [{ id: "w", title: "Glass" }], payments: [{ id: "p", amount: 10 }] }), "Bo"),
    ["Bo lade till bokningen Hotell", "Bo lade till uppgiften Packa", "Bo lade till Parkering under Praktiskt", "Bo lade till önskan Glass", "Bo registrerade en betalning på 10 kr"]);
  assert.deepEqual(describeChange(base, withs({ tasks: [{ ...base.tasks[0], done: true }] }), "Bo"), [], "ticks give no notice");
});

// REQ: NT-02 a change the receiver cannot see, or a hidden activity, gives no notice
test("NT-02 hidden things are never named", () => {
  const hidden = { id: "a2", text: "", placeIds: [], start: "14:00", hidden: true };
  assert.deepEqual(describeChange(base, withs({ days: [day([...base.days[0].activities, hidden])] }), "Anna"), []);
  assert.deepEqual(describeChange(base, withs({ expenses: [...base.expenses, { id: "e2", text: "", amount: 30, hidden: true }] }), "Anna"), ["Anna lade till en utgift: 30 kr"]);
  assert.deepEqual(describeChange(base, base, "Anna"), []);
});

// REQ: NT-01 several changes give one notice with at most three lines
test("NT-01 noticeBody", () => {
  assert.equal(noticeBody(["a", "b"]), "a\nb");
  assert.equal(noticeBody(["a", "b", "c", "d", "e"]), "a\nb\nc\noch 2 ändringar till");
});
