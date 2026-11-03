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

/** A fictional mail with only the given subject and text. */
const bare = (to: string, subject: string, text: string) => new TextEncoder().encode([
  "From: Anna Exempel <anna@example.org>", `To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", text, "",
].join("\r\n"));
/** A fetch that answers every page with this HTML, and records what it was asked for. */
const pages = (html: string | null, asked: string[] = []) => (async (url: string | URL | Request) => {
  asked.push(String(url));
  return html === null ? new Response("gone", { status: 404 }) : new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}) as typeof fetch;

async function setup(store: Store = memoryStore([trip()])) {
  const app = createApp(store, tokens, { inboxDomain: "resa.example.org" });
  const { address } = await json(call(app, "/api/trips/berlin/inbox", "a", "POST")); // BK-26: the trip's one address
  return { app, store, address: address as string };
}

// REQ: DB-23 a mail sorted as a wish becomes a wish at once, logged as mejl
test("DB-23 a mail becomes a wish", async () => {
  const { store, address } = await setup();
  const r = await receiveMail(store, mail(`Önska <${address.toUpperCase()}>`), `Önska <${address.toUpperCase()}>`);
  assert.ok("wishId" in r, JSON.stringify(r));
  const t = (await store.load("berlin"))!;
  assert.equal(t.revision, 3);
  const w = t.dreams[0]!;
  assert.deepEqual([w.id, w.title, w.url, w.category, w.source, w.votes], [r.wishId, "Tropiska Badparadiset", "https://example.org/bad", "Bad", "Mejl från Anna", 0]);
  assert.ok(w.mailedAt);
  assert.equal((await store.log()).at(-1)!.actor, "mejl");
  assert.equal((await store.proposals("berlin")).filter((p) => p.status !== "wish").length, 0, "no proposal; only the kept mail (BK-33)");
  assert.deepEqual(await receiveMail(store, bare(address, "Fwd:", ""), address), { error: "no title" }, "neither a title nor a link");
  assert.deepEqual(await receiveMail(store, mail("nagon@resa.example.org"), "nagon@resa.example.org"), { error: "unknown address" });
});

// REQ: DB-23 on the Node server a Planerare or the superuser posts the raw mail
test("DB-23 posting a wish mail", async () => {
  const { app, address } = await setup();
  const traveler = await person(app, "anna", "traveler");
  const post = (auth: string) => app.request("/api/trips/berlin/mail", { method: "POST", headers: { authorization: `Bearer ${auth}` }, body: mail(address) });
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

// REQ: DB-26 a mail with only a link gets the title of the link's page, og:title first
test("DB-26 the title from the linked page", async () => {
  const { store, address } = await setup();
  const asked: string[] = [];
  const html = '<html><head><title>Startsida | Liseberg</title><meta property="og:title" content="Liseberg &amp; Kaninlandet"></head></html>';
  const r = await receiveMail(store, bare(address, "", "https://www.example.org/park"), address, pages(html, asked));
  assert.ok("wishId" in r, JSON.stringify(r));
  assert.deepEqual(asked, ["https://www.example.org/park"]);
  const w = (await store.load("berlin"))!.dreams[0]!;
  assert.deepEqual([w.title, w.url], ["Liseberg & Kaninlandet", "https://www.example.org/park"]);
  await receiveMail(store, bare(address, "", "https://example.org/b"), address, pages("<title>  Glass &#228;r gott </title>"));
  assert.equal((await store.load("berlin"))!.dreams[1]!.title, "Glass är gott", "<title> when there is no og:title");
});

// REQ: DB-26 without a page title the link's host is the title; addresses on the own network are not fetched
test("DB-26 the host when the page has no title", async () => {
  const { store, address } = await setup();
  await receiveMail(store, bare(address, "", "https://www.example.org/x"), address, pages(null));
  await receiveMail(store, bare(address, "", "https://example.org/y"), address, pages("<p>ingen titel</p>"));
  const asked: string[] = [];
  for (const u of ["http://localhost:8787/api", "http://127.0.0.1/", "http://192.168.1.1/admin"])
    await receiveMail(store, bare(address, "", u), address, pages("<title>Inne</title>", asked));
  assert.deepEqual(asked, [], "nothing on the own network is fetched");
  assert.deepEqual((await store.load("berlin"))!.dreams.map((w) => w.title), ["example.org", "example.org", "localhost", "127.0.0.1", "192.168.1.1"]);
});
