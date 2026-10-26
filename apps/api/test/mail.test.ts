import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore, type Store } from "../src/app.ts";
import { receiveMail } from "../src/mail.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const person = async (app: App, travelerId: string, role: string) =>
  `person.berlin.${travelerId}.${(await json(call(app, `/api/trips/berlin/people/${travelerId}`, "a", "PUT", { role }))).secret}`;

const trip = () => ({
  id: "berlin", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], bookings: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: ["2026-10-25", "2026-10-26", "2026-10-27"].map((date, i) => ({ id: `d${i}`, date, title: "Dag", summary: "Dag", icons: ["🎢"], start: "08:00", end: "18:00", activities: [] })),
});
const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64");
const pdf = "%PDF-1.4\n% fictional ticket\n%%EOF\n";
/** A fictional forwarded hotel confirmation with a PDF and an attachment that is not a ticket. */
const mail = (to: string, subject = "VB: Bokningsbekräftelse – Hotell Kusten") => new TextEncoder().encode([
  "From: Anna Exempel <anna@example.org>", `To: ${to}`, `Subject: =?utf-8?B?${b64(subject)}?=`, "Date: Mon, 26 Oct 2026 08:00:00 +0100",
  "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="xx"', "",
  "--xx", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "",
  b64("Bokningsnummer: KST-99812\nIncheckning 25 oktober 2026 kl. 15:00\nUtcheckning 27 oktober 2026 kl. 11:00\n"),
  "--xx", 'Content-Type: application/pdf; name="bekraftelse.pdf"', 'Content-Disposition: attachment; filename="bekraftelse.pdf"', "Content-Transfer-Encoding: base64", "",
  b64(pdf),
  "--xx", 'Content-Type: application/zip; name="x.zip"', 'Content-Disposition: attachment; filename="x.zip"', "Content-Transfer-Encoding: base64", "",
  b64("PK"),
  "--xx--", "",
].join("\r\n"));

async function setup(store: Store = memoryStore([trip()])) {
  const app = createApp(store, tokens, { inboxDomain: "resa.example.org" });
  const { address } = await json(call(app, "/api/trips/berlin/inbox", "a", "POST"));
  return { app, store, address: address as string };
}

// REQ: BK-14 a Planerare or the superuser creates and replaces the inbox address; the old one stops at once; only they see it
test("BK-14 the trip's inbox address", async () => {
  const { app, store, address } = await setup();
  assert.match(address, /^berlin-[a-z0-9]{12,}@resa\.example\.org$/);
  assert.deepEqual(await json(call(app, "/api/trips/berlin/inbox", "a")), { enabled: true, address });
  const planner = await person(app, "bo", "planner"), traveler = await person(app, "anna", "traveler");
  assert.equal((await json(call(app, "/api/trips/berlin", planner))).inbox, address);
  assert.equal((await json(call(app, "/api/trips/berlin", traveler))).inbox, undefined, "a Resenär does not see it");
  assert.equal((await call(app, "/api/trips/berlin/inbox", traveler, "POST")).status, 403);
  const next = (await json(call(app, "/api/trips/berlin/inbox", planner, "POST"))).address;
  assert.notEqual(next, address);
  assert.deepEqual(await receiveMail(store, mail(address), address), { error: "unknown address" }, "the old address stops at once");
  const off = createApp(memoryStore([trip()]), tokens);
  assert.deepEqual(await json(call(off, "/api/trips/berlin/inbox", "a")), { enabled: false });
  assert.equal((await call(off, "/api/trips/berlin/inbox", "a", "POST")).status, 404);
});

// REQ: BK-15 a mail to the inbox becomes a proposed booking with its ticket attachments; the trip does not change
test("BK-15 a mail becomes a proposal", async () => {
  const { app, store, address } = await setup();
  const r = await receiveMail(store, mail(address.toUpperCase()), `Höstlov <${address.toUpperCase()}>`);
  assert.ok("proposalId" in r, JSON.stringify(r));
  const [p] = await json(call(app, "/api/trips/berlin/proposals", "a"));
  assert.equal(p.status, "pending");
  assert.deepEqual(p.ops, []);
  assert.deepEqual(p.source, { kind: "mail", from: "Anna Exempel <anna@example.org>", subject: "VB: Bokningsbekräftelse – Hotell Kusten", at: p.source.at });
  assert.equal(p.booking.name, "Hotell Kusten");
  assert.equal(p.booking.from, "2026-10-25");
  assert.equal(p.booking.to, "2026-10-27");
  assert.equal(p.booking.checkIn, "15:00");
  assert.equal(p.booking.reference, "KST-99812");
  assert.equal(p.booking.files.length, 1, "the zip is left out");
  assert.deepEqual({ ...p.booking.files[0], id: "" }, { id: "", name: "bekraftelse.pdf", type: "application/pdf", size: pdf.length });
  const f = await call(app, `/api/trips/berlin/files/${p.booking.files[0].id}`, "a");
  assert.equal(f.status, 200, "the reviewer can open it before approving");
  assert.equal(await f.text(), pdf);
  assert.equal((await json(call(app, "/api/trips/berlin", "a"))).bookings.length, 0);
  assert.equal((await call(app, `/api/trips/berlin/files/${p.booking.files[0].id}`, await person(app, "anna", "traveler"))).status, 404);
  assert.deepEqual(await receiveMail(store, mail("nobody@resa.example.org"), "nobody@resa.example.org"), { error: "unknown address" });
});

// REQ: BK-15 the Node server takes a raw message from a Planerare or the superuser
test("BK-15 posting a raw message", async () => {
  const { app } = await setup();
  const post = (auth: string) => app.request("/api/trips/berlin/mail", { method: "POST", headers: { "content-type": "message/rfc822", authorization: `Bearer ${auth}` }, body: mail("x@y.z") });
  assert.equal((await post("a")).status, 202);
  assert.equal((await post(await person(app, "anna", "traveler"))).status, 403);
  assert.equal((await json(call(app, "/api/trips/berlin/proposals", "a"))).length, 1);
});

// REQ: BK-15 at most 20 pending mail proposals per trip
test("BK-15 a limit on pending mail", async () => {
  const { store, address } = await setup();
  for (let i = 0; i < 20; i++) assert.ok("proposalId" in (await receiveMail(store, mail(address), address)));
  assert.deepEqual(await receiveMail(store, mail(address), address), { error: "too many" });
});

// REQ: BK-17 saving the edited booking approves the proposal; the trash rejects it and deletes its files
test("BK-17 approving and rejecting a mail proposal", async () => {
  const { app, store, address } = await setup();
  await receiveMail(store, mail(address), address);
  await receiveMail(store, mail(address, "Biljett"), address);
  const [p, q] = await json(call(app, "/api/trips/berlin/proposals", "a"));
  const planner = await person(app, "bo", "planner");
  assert.equal((await call(app, `/api/trips/berlin/proposals/${p.id}/approve`, planner, "POST")).status, 400, "a mail proposal is approved with the edited booking");
  const booking = { id: "kusten", name: "Hotell Kusten", from: "2026-10-25", to: "2026-10-27", status: "paid", kind: "stay", files: p.booking.files };
  const t = await json(call(app, "/api/trips/berlin", "a"));
  const ok = await call(app, `/api/trips/berlin/proposals/${p.id}/approve`, planner, "POST", { baseRevision: t.revision, ops: [{ op: "add", path: "bookings/-", value: booking }] });
  assert.equal(ok.status, 200);
  const after = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual(after.bookings, [booking]);
  assert.equal((await json(call(app, "/api/log", "a"))).at(-1).actor, "Bo");
  assert.equal((await call(app, `/api/trips/berlin/proposals/${p.id}/approve`, planner, "POST", { baseRevision: after.revision, ops: [] })).status, 404, "only once");
  assert.equal((await call(app, `/api/trips/berlin/files/${p.booking.files[0].id}`, "a")).status, 200);
  assert.equal((await call(app, `/api/trips/berlin/proposals/${q.id}/reject`, await person(app, "anna", "traveler"), "POST")).status, 403);
  assert.equal((await call(app, `/api/trips/berlin/proposals/${q.id}/reject`, planner, "POST")).status, 200);
  assert.equal((await call(app, `/api/trips/berlin/files/${q.booking.files[0].id}`, "a")).status, 404, "its file is deleted");
  const stale = await call(app, `/api/trips/berlin/proposals/${p.id}/approve`, "a", "POST", { baseRevision: 1, ops: [] });
  assert.equal(stale.status, 404);
});
