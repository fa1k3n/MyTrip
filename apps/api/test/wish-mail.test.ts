import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore, type Store } from "../src/app.ts";
import { receiveMail, wishSource } from "../src/mail.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const person = async (app: App, travelerId: string, role: string) =>
  `person.berlin.${travelerId}.${(await json(call(app, `/api/trips/berlin/people/${travelerId}`, "a", "PUT", { role }))).secret}`;

const trip = (extra: object = {}) => ({
  id: "berlin", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], bookings: [], days: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }], ...extra,
});
const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64");
/** A fictional PNG of the given size: only its first bytes matter to the checks. */
const png = (size: number) => { const b = new Uint8Array(size); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return b; };
/** A fictional mail from Safari's share sheet: the page title as subject and the link as text, with optional images. */
const mail = (to: string, subject = "Tropiska Badparadiset", images: Uint8Array[] = []) => new TextEncoder().encode([
  "From: Anna Exempel <anna@example.org>", `To: ${to}`, `Subject: =?utf-8?B?${b64(subject)}?=`, "Date: Sun, 1 Nov 2026 10:00:00 +0100",
  "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="xx"', "",
  "--xx", "Content-Type: text/plain; charset=utf-8", "", "https://example.org/bad",
  ...images.flatMap((b, i) => ["--xx", `Content-Type: image/png; name="bild${i}.png"`, `Content-Disposition: inline; filename="bild${i}.png"`, "Content-Transfer-Encoding: base64", "", b64(b)]),
  "--xx--", "",
].join("\r\n"));

async function setup(store: Store = memoryStore([trip()])) {
  const app = createApp(store, tokens, { inboxDomain: "resa.example.org" });
  const { address } = await json(call(app, "/api/trips/berlin/wish-inbox", "a", "POST"));
  return { app, store, address: address as string };
}

// REQ: DB-21 one wish address per trip, apart from the booking inbox; replaced at once; never sent to a Följare
test("DB-21 the trip's wish address", async () => {
  const { app, store, address } = await setup();
  assert.match(address, /^berlin-onska-[a-z0-9]{12,}@resa\.example\.org$/);
  const inbox = (await json(call(app, "/api/trips/berlin/inbox", "a", "POST"))).address;
  assert.notEqual(inbox, address, "the booking inbox is another address");
  const planner = await person(app, "bo", "planner"), traveler = await person(app, "anna", "traveler");
  assert.equal((await json(call(app, "/api/trips/berlin", planner))).wishInbox, address);
  assert.equal((await json(call(app, "/api/trips/berlin", traveler))).wishInbox, address, "a Resenär who sees wishes gets it");
  assert.equal((await json(call(app, "/api/trips/berlin", traveler))).inbox, undefined, "but not the booking inbox");
  const secret = (await json(call(app, "/api/trips/berlin/link", "a", "POST"))).secret;
  assert.equal((await json(call(app, "/api/trips/berlin", `link.berlin.${secret}`))).wishInbox, undefined, "a Följare does not");
  assert.equal((await json(call(app, "/api/trips/berlin", "r"))).wishInbox, undefined, "nor a read token");
  assert.equal((await call(app, "/api/trips/berlin/wish-inbox", traveler, "POST")).status, 403);
  const next = (await json(call(app, "/api/trips/berlin/wish-inbox", planner, "POST"))).address;
  assert.notEqual(next, address);
  assert.deepEqual(await receiveMail(store, mail(address), address), { error: "unknown address" }, "the old address stops at once");
  const off = createApp(memoryStore([trip()]), tokens);
  assert.equal((await call(off, "/api/trips/berlin/wish-inbox", "a", "POST")).status, 404);
});

// REQ: DB-21 a Resenär whose role does not see wishes does not get the address
test("DB-21 hidden wishes, no address", async () => {
  const { app } = await setup(memoryStore([trip({ access: { traveler: { dr: { parts: { dreams: "hidden" } } } } })]));
  const traveler = await person(app, "anna", "traveler");
  assert.equal((await json(call(app, "/api/trips/berlin", traveler))).wishInbox, undefined);
});

// REQ: DB-23 a mail to the wish address becomes a wish at once, logged as mejl; the booking inbox still makes proposals
test("DB-23 a mail becomes a wish", async () => {
  const { app, store, address } = await setup();
  const r = await receiveMail(store, mail(`Önska <${address.toUpperCase()}>`), `Önska <${address.toUpperCase()}>`);
  assert.ok("wishId" in r, JSON.stringify(r));
  const t = (await store.load("berlin"))!;
  assert.equal(t.revision, 3);
  const w = t.dreams[0]!;
  assert.deepEqual([w.id, w.title, w.url, w.category, w.source, w.votes], [r.wishId, "Tropiska Badparadiset", "https://example.org/bad", "Bad", "Mejl från Anna", 0]);
  assert.ok(w.mailedAt);
  assert.equal((await store.log()).at(-1)!.actor, "mejl");
  assert.equal((await store.proposals("berlin")).length, 0, "no proposal");
  const inbox = (await json(call(app, "/api/trips/berlin/inbox", "a", "POST"))).address;
  assert.ok("proposalId" in (await receiveMail(store, mail(inbox), inbox)), "a booking mail is still a proposal");
  assert.deepEqual(await receiveMail(store, mail(address, "Fwd:"), address), { error: "no title" });
  assert.deepEqual(await receiveMail(store, mail("nagon@resa.example.org"), "nagon@resa.example.org"), { error: "unknown address" });
});

// REQ: DB-23 on the Node server a Planerare or the superuser posts the raw mail
test("DB-23 posting a wish mail", async () => {
  const { app, address } = await setup();
  const traveler = await person(app, "anna", "traveler");
  const post = (auth: string) => app.request("/api/trips/berlin/wish-mail", { method: "POST", headers: { authorization: `Bearer ${auth}` }, body: mail(address) });
  assert.equal((await post(traveler)).status, 403);
  const r = await post("a");
  assert.equal(r.status, 201);
  assert.ok((await r.json()).wishId);
});

// REQ: DB-24 the largest attached image of at least 8 KB and at most the DB-08 size becomes the wish's own photo
test("DB-24 an attached photo", async () => {
  const { store, address } = await setup();
  const logo = png(2000), photo = png(60_000), bigger = png(400 * 1024);
  const r = await receiveMail(store, mail(address, "Glasskiosken", [logo, photo, bigger]), address);
  assert.ok("wishId" in r);
  const w = (await store.load("berlin"))!.dreams[0]!;
  assert.equal(w.image?.kind, "own");
  const f = await store.file(w.image!.file);
  assert.deepEqual([f?.type, f?.bytes.length, f?.tripId], ["image/png", 60_000, "berlin"]);
  await receiveMail(store, mail(address, "Bara logga", [logo]), address);
  assert.equal((await store.load("berlin"))!.dreams[1]!.image, undefined, "a logo is not a photo");
});

// REQ: DB-25 at most 20 wishes by mail per trip in 24 hours
test("DB-25 a limit per day", async () => {
  const { store, address } = await setup();
  for (let i = 0; i < 20; i++) assert.ok("wishId" in (await receiveMail(store, mail(address, `Önskan ${i}`), address)), String(i));
  assert.deepEqual(await receiveMail(store, mail(address, "En till"), address), { error: "too many" });
});

// REQ: DB-23 the source is Mejl, with the first word of the sender's display name as a hint
test("DB-23 the source", () => {
  assert.equal(wishSource("Anna Exempel"), "Mejl från Anna");
  assert.equal(wishSource('  "Bo"  '), "Mejl från Bo");
  assert.equal(wishSource(""), "Mejl");
  assert.equal(wishSource(undefined), "Mejl");
});
