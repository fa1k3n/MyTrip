import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { balances, defaultSharers, sharedByValue, sharersText, sharesOps, splitOps } from "../src/money.ts";

const family = [{ id: "anna" }, { id: "bo" }, { id: "kalle", shares: false }, { id: "lisa", shares: false }];
const ids = family.map((x) => x.id);

// REQ: MI-38 an expense shared by all is shared by those who share costs; if nobody does, by everyone
test("MI-38 defaultSharers and balances", () => {
  assert.deepEqual(defaultSharers(family), ["anna", "bo"]);
  assert.deepEqual(defaultSharers([{ id: "a", shares: false }, { id: "b", shares: false }]), ["a", "b"]);
  assert.deepEqual(balances(family, [{ amount: 100, paidBy: "anna", sharedBy: [] }], []), { anna: 50, bo: -50, kalle: 0, lisa: 0 });
  assert.deepEqual(balances(family, [{ amount: 100, paidBy: "kalle", sharedBy: ["kalle", "lisa"] }], []), { anna: 0, bo: 0, kalle: 50, lisa: -50 });
});

// REQ: MI-38 choosing exactly those who share costs stores [], anything else the chosen travelers in the travelers' order
test("MI-38 sharedByValue with those who share", () => {
  const def = defaultSharers(family);
  assert.deepEqual(sharedByValue(["bo", "anna"], def, ids), []);
  assert.deepEqual(sharedByValue(["lisa", "anna", "bo", "kalle"], def, ids), ids, "the children too, for this one");
  assert.deepEqual(sharedByValue(["anna"], def, ids), ["anna"]);
});

const trip = () => Trip.parse({
  id: "t", revision: 1, title: "t", timezone: "Europe/Berlin", stops: [], days: [], places: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "kalle", name: "Kalle", packing: [] }, { id: "lisa", name: "Lisa", packing: [] }],
  expenses: [{ id: "e", text: "Glass", category: "Mat", amount: 60, paidBy: "anna", sharedBy: [] }],
});

// REQ: MI-38 the setting is stored only when off, and the split dialog stores the kids explicitly
test("MI-38 sharesOps and splitOps", () => {
  const off = Trip.parse(applyOps(trip(), sharesOps(trip(), "kalle", false)));
  assert.equal(off.travelers[1].shares, false);
  assert.deepEqual(sharesOps(off, "kalle", false), []);
  assert.equal(Trip.parse(applyOps(off, sharesOps(off, "kalle", true))).travelers[1].shares, undefined);
  const r = splitOps(off, "e", ["anna", "lisa"]);
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.ops, [{ op: "set", path: "expenses/0/sharedBy", value: [] }], "anna and lisa are exactly those who share");
  const r2 = splitOps(off, "e", ["anna", "kalle", "lisa"]);
  assert.deepEqual(r2.ok && r2.ops, [{ op: "set", path: "expenses/0/sharedBy", value: ["anna", "kalle", "lisa"] }]);
});

// REQ: MI-38 Pengar names the sharers when not everyone shares
test("MI-38 sharersText", () => {
  const name = (id: string) => id[0].toUpperCase() + id.slice(1);
  assert.equal(sharersText([], [{ id: "a" }, { id: "b" }], name), "alla");
  assert.equal(sharersText([], family, name), "Anna, Bo");
  assert.equal(sharersText(["kalle", "anna"], family, name), "Kalle, Anna");
});
