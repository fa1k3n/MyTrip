import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingTwin, wishTwin } from "../src/duplicates.ts";

const b = (id: string, name: string, from: string, extra: object = {}) => ({ id, name, from, to: from, status: "ready", ...extra });

// REQ: BK-30 a mailed booking that repeats a booking or an earlier mail: the same reference, or the same name and first date
test("BK-30 bookingTwin", () => {
  const bookings = [b("kusten", "Hotell Kusten", "2026-10-25", { reference: "KST-99812" }), b("zoo", "Zoo", "2026-10-26", { status: "tobook" }),
    b("old", "Färja Rostock", "2026-10-28", { status: "cancelled", reference: "TL-1" })];
  assert.deepEqual(bookingTwin({ name: "Annat namn", reference: "kst 99812" }, bookings, []), { kind: "booking", id: "kusten", name: "Hotell Kusten" });
  assert.deepEqual(bookingTwin({ name: "hotell kusten!", from: "2026-10-25" }, bookings, [])?.id, "kusten");
  assert.equal(bookingTwin({ name: "Hotell Kusten", from: "2026-10-26" }, bookings, []), undefined, "another date");
  assert.equal(bookingTwin({ name: "Zoo", from: "2026-10-26" }, bookings, []), undefined, "Att boka is matched by BK-22 instead");
  assert.equal(bookingTwin({ name: "Färja Rostock", from: "2026-10-28", reference: "TL-1" }, bookings, []), undefined, "a cancelled booking");
  assert.equal(bookingTwin({ name: "Hotell Kusten", reference: "KST-99812", status: "cancelled" }, bookings, []), undefined, "a cancellation is an update");
  assert.equal(bookingTwin({ name: "Hotell Kusten", reference: "" }, bookings, []), undefined, "no reference and no date");
  const earlier = [{ id: "m1", name: "VB: Bokning Spree", reading: { name: "Hotel Spree", reference: "SPX-77310" } }];
  assert.deepEqual(bookingTwin({ name: "Hotel Spree", reference: "SPX-77310" }, [], earlier), { kind: "mail", id: "m1", name: "VB: Bokning Spree" });
});

// REQ: DB-27 a mailed wish with the title of a wish of the trip, ignoring case, accents and punctuation; not one that resembles a hidden activity
test("DB-27 wishTwin", () => {
  const t = {
    dreams: [{ id: "w1", title: "Naturkundemuseum", source: "Mejl" }, { id: "w2", title: "Liseberg", source: "Från Claude" }],
    days: [{ activities: [{ id: "a", text: "Liseberg", hiddenFrom: ["bo"] }] }],
  };
  assert.equal(wishTwin({ title: "naturkundemuséum." }, t)?.id, "w1");
  assert.equal(wishTwin({ title: "Naturkundemuseum Berlin" }, t), undefined, "only the same title");
  assert.equal(wishTwin({ title: "Liseberg" }, t), undefined, "a rejection would give the hidden activity away");
  assert.equal(wishTwin({}, t), undefined);
  // a title taken from the link's host (DB-26) is a twin only with the same link
  const hosts = { dreams: [{ id: "x", title: "example.org", source: "Mejl", url: "https://example.org/x" }], days: [] };
  assert.equal(wishTwin({ title: "example.org", url: "https://example.org/y", titleFromLink: true }, hosts), undefined);
  assert.equal(wishTwin({ title: "example.org", url: "https://example.org/x/", titleFromLink: true }, hosts)?.id, "x");
});
