import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mailTwins } from "../src/proposals.ts";
import { sv } from "../src/sv.ts";

const m = (id: string, at: string, booking: object, subject = id) => ({ id, status: "pending" as const, source: { kind: "mail" as const, from: "", subject, at }, booking });

// REQ: BK-30 a pending mail is marked when it repeats a booking or a mail that came before it; the first of two mails is not marked
test("BK-30 mailTwins", () => {
  const t = { bookings: [{ id: "kusten", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-27", status: "paid" as const, reference: "KST-99812" }] };
  const mails = [m("b", "2026-11-02T10:00:00Z", { name: "Hotel Spree", reference: "SPX-77310" }, "Spree igen"),
    m("a", "2026-11-01T10:00:00Z", { name: "Hotel Spree", reference: "SPX-77310" }, "Spree"),
    m("c", "2026-11-02T11:00:00Z", { name: "Kusten", reference: "KST 99812" })];
  const twins = mailTwins(t, mails);
  assert.equal(twins.get("a"), undefined);
  assert.equal(twins.get("b"), sv.mail.twin("Spree"));
  assert.equal(twins.get("c"), sv.mail.twin("Hotell Kusten"));
  assert.equal(sv.mail.twin("Hotell Kusten"), "Finns kanske redan: Hotell Kusten");
  // the mark is the caution triangle before the name, with the text as its name and tooltip (warning levels, UI-22)
  assert.match(readFileSync(new URL("../src/Side.tsx", import.meta.url), "utf8"), /className="twin" role="img" aria-label=\{twin\} title=\{twin\}><Icon name="alert" \/>/);
});

// REQ: DB-27 Gör till önskan tells that the wish is already on the trip
test("DB-27 the wish exists", () => {
  assert.equal(sv.mail.wishExists, "Önskan finns redan i Önska.");
});
