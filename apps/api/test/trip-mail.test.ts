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
const trip = (extra: object = {}) => ({
  id: "berlin", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], bookings: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: ["2026-10-25", "2026-10-26"].map((date, i) => ({ id: `d${i}`, date, title: "Dag", summary: "Dag", icons: ["🎢"], start: "08:00", end: "18:00", activities: [] })), ...extra,
});
const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64");
const png = (size: number) => { const b = new Uint8Array(size); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return b; };
/** A fictional mail with a subject, a text and optional attachments. */
const mail = (to: string, subject: string, text: string, files: { type: string; name: string; bytes: Uint8Array | string }[] = []) => new TextEncoder().encode([
  "From: Anna Exempel <anna@example.org>", `To: ${to}`, `Subject: =?utf-8?B?${b64(subject)}?=`, "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="xx"', "",
  "--xx", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(text),
  ...files.flatMap((f) => ["--xx", `Content-Type: ${f.type}; name="${f.name}"`, `Content-Disposition: attachment; filename="${f.name}"`, "Content-Transfer-Encoding: base64", "", b64(f.bytes)]),
  "--xx--", "",
].join("\r\n"));
const booking = (to: string) => mail(to, "VB: Bokningsbekräftelse – Hotell Kusten", "Bokningsnummer: KST-99812\nIncheckning 25 oktober 2026 kl. 15:00\n");
const wish = (to: string) => mail(to, "Tropiska Badparadiset", "https://example.org/bad");
const app = (store: Store = memoryStore([trip()]), inboxDomain: string | null = "resa.example.org") => createApp(store, tokens, inboxDomain ? { inboxDomain } : {});

// REQ: BK-26 one address per trip, made when first asked for, without the trip's name, the same on every ask
test("BK-26 the trip's address is made when asked for", async () => {
  const store = memoryStore([trip()]), a = app(store);
  assert.equal((await json(call(a, "/api/trips/berlin", "a"))).inbox, undefined, "not made before it is asked for");
  const { address } = await json(call(a, "/api/trips/berlin/inbox", "a", "POST"));
  assert.match(address, /^inkorg-[a-z2-7]{16,}@resa\.example\.org$/);
  assert.ok(!address.includes("berlin"));
  assert.equal((await json(call(a, "/api/trips/berlin/inbox", "a", "POST"))).address, address, "asking again gives the same");
  assert.equal((await store.load("berlin"))!.inbox, address);
  const off = app(memoryStore([trip()]), null);
  assert.equal((await call(off, "/api/trips/berlin/inbox", "a", "POST")).status, 404);
});

// REQ: BK-26 a Planerare, the superuser and a Resenär who sees wishes get it; a Följare, a read token and a Resenär without wishes do not
test("BK-26 who gets the address", async () => {
  const a = app();
  const { address } = await json(call(a, "/api/trips/berlin/inbox", "a", "POST"));
  const planner = await person(a, "bo", "planner"), traveler = await person(a, "anna", "traveler");
  assert.equal((await json(call(a, "/api/trips/berlin", planner))).inbox, address);
  assert.equal((await json(call(a, "/api/trips/berlin", traveler))).inbox, address);
  assert.equal((await json(call(a, "/api/trips/berlin/inbox", traveler, "POST"))).address, address, "a Resenär may ask for it");
  const secret = (await json(call(a, "/api/trips/berlin/link", "a", "POST"))).secret;
  assert.equal((await json(call(a, "/api/trips/berlin", `link.berlin.${secret}`))).inbox, undefined);
  assert.equal((await call(a, "/api/trips/berlin/inbox", `link.berlin.${secret}`, "POST")).status, 403);
  assert.equal((await json(call(a, "/api/trips/berlin", "r"))).inbox, undefined);
  const hidden = app(memoryStore([trip({ access: { traveler: { dr: { parts: { dreams: "hidden" } } } } })]));
  await call(hidden, "/api/trips/berlin/inbox", "a", "POST");
  const t2 = await person(hidden, "anna", "traveler");
  assert.equal((await json(call(hidden, "/api/trips/berlin", t2))).inbox, undefined);
  assert.equal((await call(hidden, "/api/trips/berlin/inbox", t2, "POST")).status, 403);
});

// REQ: BK-26 replacing the address stops the old one and any earlier booking or wish address; earlier ones work until then
test("BK-26 replacing the address", async () => {
  const store = memoryStore([trip({ inbox: "berlin-gammal1234@resa.example.org", wishInbox: "berlin-onska-gammal5678@resa.example.org" })]), a = app(store);
  assert.ok("proposalId" in (await receiveMail(store, booking("berlin-gammal1234@resa.example.org"), "berlin-gammal1234@resa.example.org")), "an earlier inbox works");
  assert.ok("wishId" in (await receiveMail(store, wish("berlin-onska-gammal5678@resa.example.org"), "berlin-onska-gammal5678@resa.example.org")), "an earlier wish address works");
  const traveler = await person(a, "anna", "traveler");
  assert.equal((await call(a, "/api/trips/berlin/inbox/replace", traveler, "POST")).status, 403, "only a Planerare or the superuser");
  const { address } = await json(call(a, "/api/trips/berlin/inbox/replace", "a", "POST"));
  assert.match(address, /^inkorg-/);
  for (const old of ["berlin-gammal1234@resa.example.org", "berlin-onska-gammal5678@resa.example.org"])
    assert.deepEqual(await receiveMail(store, wish(old), old), { error: "unknown address" }, old);
  assert.equal((await store.load("berlin"))!.wishInbox, undefined);
});

// REQ: BK-27 the app asks whether mail import is set up, to show the mail buttons; asking makes no address; a Följare may not ask
test("BK-27 mail import on or off", async () => {
  const store = memoryStore([trip()]), a = app(store);
  assert.deepEqual(await json(call(a, "/api/trips/berlin/inbox", "a")), { enabled: true });
  assert.equal((await store.load("berlin"))!.inbox, undefined);
  const { address } = await json(call(a, "/api/trips/berlin/inbox", "a", "POST"));
  assert.deepEqual(await json(call(a, "/api/trips/berlin/inbox", await person(a, "anna", "traveler"))), { enabled: true, address });
  const secret = (await json(call(a, "/api/trips/berlin/link", "a", "POST"))).secret;
  assert.equal((await call(a, "/api/trips/berlin/inbox", `link.berlin.${secret}`)).status, 403);
  assert.deepEqual(await json(call(app(memoryStore([trip()]), null), "/api/trips/berlin/inbox", "a")), { enabled: false });
});

// REQ: BK-28 one address: a confirmation becomes a proposed booking, a shared page a wish, "Bokning:" a booking, a PDF a booking
test("BK-28 mail is sorted", async () => {
  const store = memoryStore([trip()]), a = app(store);
  const { address } = await json(call(a, "/api/trips/berlin/inbox", "a", "POST"));
  assert.ok("proposalId" in (await receiveMail(store, booking(address), address)));
  assert.ok("wishId" in (await receiveMail(store, wish(address), address)));
  assert.ok("proposalId" in (await receiveMail(store, mail(address, "Bokning: Bord på Fischereihafen", "https://example.org/bord"), address)));
  assert.ok("proposalId" in (await receiveMail(store, mail(address, "Liseberg", "", [{ type: "application/pdf", name: "b.pdf", bytes: "%PDF-1.4\n%%EOF\n" }]), address)));
  const t = (await store.load("berlin"))!;
  assert.deepEqual(t.dreams.map((w) => w.title), ["Tropiska Badparadiset"]);
  const ps = (await store.proposals("berlin")).filter((p) => p.status !== "wish"); // a wish's kept mail is no proposal (BK-33)
  assert.deepEqual(ps.map((p) => p.booking?.name), ["Hotell Kusten", "Bord på Fischereihafen", "Liseberg"]);
  const post = await a.request("/api/trips/berlin/mail", { method: "POST", headers: { authorization: "Bearer a" }, body: booking(address) });
  assert.equal(post.status, 202, "the Node server sorts a posted mail too");
});

// REQ: BK-29 a mail proposal becomes a wish, with its link, category and first photo; its other files go and the proposal closes
test("BK-29 Gör till önskan", async () => {
  const store = memoryStore([trip()]), a = app(store);
  const { address } = await json(call(a, "/api/trips/berlin/inbox", "a", "POST"));
  const r = await receiveMail(store, mail(address, "Bokning: Tropiska Badparadiset", "Se https://example.org/bad", [
    { type: "image/png", name: "bad.png", bytes: png(60_000) }, { type: "application/pdf", name: "b.pdf", bytes: "%PDF-1.4\n%%EOF\n" }]), address);
  assert.ok("proposalId" in r);
  const before = (await store.proposals("berlin"))[0]!;
  assert.equal(before.booking?.files?.length, 2);
  const traveler = await person(a, "anna", "traveler");
  assert.equal((await call(a, `/api/trips/berlin/proposals/${r.proposalId}/wish`, traveler, "POST")).status, 403);
  const res = await call(a, `/api/trips/berlin/proposals/${r.proposalId}/wish`, "a", "POST");
  assert.equal(res.status, 201);
  const t = (await store.load("berlin"))!, w = t.dreams[0]!;
  assert.deepEqual([w.title, w.url, w.category, w.source], ["Tropiska Badparadiset", "https://example.org/bad", "Bad", "Mejl från Anna"]);
  assert.equal(w.image?.kind, "own");
  assert.equal((await store.file(w.image!.file))?.type, "image/png");
  const pdf = before.booking!.files!.find((f) => f.type === "application/pdf")!;
  assert.ok(!(await store.file(pdf.id)), "the PDF is deleted");
  assert.notEqual((await store.proposals("berlin"))[0]!.status, "pending");
  assert.equal((await call(a, `/api/trips/berlin/proposals/${r.proposalId}/wish`, "a", "POST")).status, 404, "only a pending proposal");
});
