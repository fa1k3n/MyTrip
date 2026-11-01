import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import { cacheKey, commonsImage, licenceOk } from "../src/wishimage.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = async (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
const THUMB = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Zoo_Tor.jpg/500px-Zoo_Tor.jpg";

type Meta = { licence?: string; restrictions?: string; local?: boolean };
/** A fake Wikimedia: titles map to articles; every request is counted. */
function wikimedia(articles: Record<string, Meta> = { "berlin zoo": {} }, calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "").toLowerCase();
    if (url.includes("/w/rest.php/v1/search/title")) {
      if (!url.startsWith("https://en.")) return Response.json({ pages: [] });
      return Response.json({ pages: articles[q] ? [{ key: q.replace(/ /g, "_"), thumbnail: { url: "//x" } }] : [] });
    }
    const sum = url.match(/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/(.+)$/);
    if (sum) {
      const a = articles[decodeURIComponent(sum[1]!).replace(/_/g, " ")]!;
      const base = a.local ? "https://upload.wikimedia.org/wikipedia/en" : "https://upload.wikimedia.org/wikipedia/commons";
      return Response.json({ thumbnail: { source: `${base}/thumb/a/ab/Zoo_Tor.jpg/320px-Zoo_Tor.jpg` }, originalimage: { source: `${base}/a/ab/Zoo_Tor.jpg`, width: 4000 } });
    }
    if (url.startsWith("https://commons.wikimedia.org/w/api.php")) {
      const a = Object.values(articles)[0]!;
      return Response.json({ query: { pages: { "1": { imageinfo: [{ extmetadata: {
        Artist: { value: "<a href=\"x\">Anna Fotograf</a> (<a>talk</a> · <a>contribs</a>)" }, LicenseShortName: { value: a.licence ?? "CC BY-SA 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" }, ...(a.restrictions ? { Restrictions: { value: a.restrictions } } : {}),
      } }] } } } });
    }
    if (url === THUMB) return new Response(PNG, { headers: { "content-type": "image/png" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

// REQ: DB-06 licences on the allow list
test("DB-06 the licence allow list", () => {
  for (const ok of ["CC BY-SA 4.0", "CC BY 2.0", "CC-BY-SA-3.0", "CC0", "Public domain", "PD-self", "CC BY-SA 3.0 de"]) assert.ok(licenceOk(ok), ok);
  for (const bad of ["CC BY-NC 2.0", "CC BY-ND 4.0", "CC BY-NC-SA 3.0", "Fair use", "", "GFDL", "All rights reserved"]) assert.equal(licenceOk(bad), false, bad);
});

// REQ: DB-06 only Commons files with an allowed licence and no restrictions, as a thumbnail at most 640 px wide
test("DB-06 an image from Wikimedia Commons", async () => {
  assert.deepEqual(await commonsImage("Berlin Zoo", wikimedia()), { image: THUMB, page: "https://commons.wikimedia.org/wiki/File:Zoo_Tor.jpg",
    author: "Anna Fotograf", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0" });
  assert.equal(await commonsImage("Berlin Zoo", wikimedia({ "berlin zoo": { local: true } })), undefined, "a local Wikipedia upload is not used");
  assert.equal(await commonsImage("Berlin Zoo", wikimedia({ "berlin zoo": { licence: "CC BY-NC 2.0" } })), undefined);
  assert.equal(await commonsImage("Berlin Zoo", wikimedia({ "berlin zoo": { restrictions: "personality" } })), undefined);
  assert.equal(await commonsImage("Okänt ställe", wikimedia()), undefined);
  await assert.rejects(commonsImage("Berlin Zoo", async () => new Response("busy", { status: 429 })), "a busy service is an error, not nothing found");
  assert.equal(cacheKey("  Berlin   ZOO "), "berlin zoo");
});

const trip = (id = "berlin", lastDay = "2026-10-25") => ({
  id, revision: 1, title: id, timezone: "Europe/Berlin", stops: [], places: [], packing: [], bookings: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: lastDay, title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [
    { id: "tarta", text: "Tårta", placeIds: [], hiddenFrom: ["bo"] }] }],
  dreams: [{ id: "zoo", title: "Berlin Zoo", category: "Aktivitet", source: "Tips", icon: "✨", votes: 0 },
    { id: "tarta-w", title: "Tårta", category: "Mat", source: "", icon: "✨", votes: 0 },
    { id: "nix", title: "Xyzzy", category: "Mat", source: "", icon: "✨", votes: 0 }],
});
const person = async (app: App, tripId: string, id: string, role: string) =>
  `person.${tripId}.${id}.${(await json(call(app, `/api/trips/${tripId}/people/${id}`, "a", "PUT", { role }))).secret}`;
const auto = (app: App, wid: string, auth = "a", tripId = "berlin") => call(app, `/api/trips/${tripId}/dreams/${wid}/image/auto`, auth, "POST", {});
const upload = (app: App, wid: string, bytes: Uint8Array, auth = "a", type = "image/jpeg") =>
  app.request(`/api/trips/berlin/dreams/${wid}/image/upload`, { method: "POST", headers: { "content-type": type, authorization: `Bearer ${auth}` }, body: new Blob([Uint8Array.from(bytes)]) });

// REQ: DB-07 the first image found is used automatically, once; nothing found marks the wish as tried; a busy service does not
test("DB-07 an image chosen automatically", async () => {
  const app = createApp(memoryStore([trip()]), tokens, { fetch: wikimedia() });
  const r = await json(auto(app, "zoo"));
  assert.equal(r.image.kind, "commons");
  assert.deepEqual(await json(auto(app, "zoo")), { skipped: true });
  await auto(app, "nix");
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual([t.dreams[0].image.author, t.dreams[2].image, t.dreams[2].imageTried], ["Anna Fotograf", undefined, true]);
  const busy = createApp(memoryStore([trip()]), tokens, { fetch: async () => new Response("busy", { status: 429 }) });
  assert.deepEqual(await json(auto(busy, "zoo")), { failed: true });
  assert.equal((await json(call(busy, "/api/trips/berlin", "a"))).dreams[0].imageTried, undefined);
});

// REQ: DB-07 the dialog searches with own words and shows a preview from our own server, then the user chooses it
test("DB-07 searching again in the dialog", async () => {
  const app = createApp(memoryStore([trip()]), tokens, { fetch: wikimedia() });
  const found = await json(call(app, "/api/trips/berlin/dreams/nix/image/find", "a", "POST", { query: "Berlin Zoo" }));
  assert.deepEqual([found.found.licence, found.preview.startsWith("data:image/png;base64,")], ["CC BY-SA 4.0", true]);
  assert.equal((await json(call(app, "/api/trips/berlin", "a"))).revision, 1, "nothing changes before the user chooses");
  assert.equal((await call(app, "/api/trips/berlin/dreams/nix/image", "a", "POST", { query: "Berlin Zoo" })).status, 200);
  assert.equal((await json(call(app, "/api/trips/berlin", "a"))).dreams[2].image.page, "https://commons.wikimedia.org/wiki/File:Zoo_Tor.jpg");
  assert.deepEqual(await json(call(app, "/api/trips/berlin/dreams/nix/image/find", "a", "POST", { query: "Okänt" })), { found: null });
});

// REQ: DB-08 images are copies of at most 300 kB, checked by content; an own photo's file goes with it; a Commons file stays for the cache
test("DB-08 stored copies", async () => {
  const store = memoryStore([trip()]);
  const app = createApp(store, tokens, { fetch: wikimedia() });
  assert.equal((await upload(app, "zoo", new Uint8Array(300 * 1024 + 1).fill(0xff))).status, 413);
  assert.equal((await upload(app, "zoo", new TextEncoder().encode("<html>"), "a", "image/png")).status, 415);
  assert.equal((await upload(app, "zoo", JPEG)).status, 200);
  const own = (await json(call(app, "/api/trips/berlin", "a"))).dreams[0].image;
  assert.deepEqual([own.kind, own.author], ["own", undefined]);
  const f = await call(app, `/api/trips/berlin/files/${own.file}`, "a");
  assert.deepEqual([f.status, f.headers.get("content-type")], [200, "image/jpeg"]);
  assert.equal((await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: 2, ops: [{ op: "remove", path: "dreams/0/image" }, { op: "set", path: "dreams/0/imageTried", value: true }], reason: "x" })).status, 200);
  assert.equal(await store.file(own.file), undefined, "an own photo goes with its image");
  await auto(app, "nix", "a"); // nothing found
  await call(app, "/api/trips/berlin/dreams/tarta-w/image", "a", "POST", { query: "Berlin Zoo" });
  const commons = (await json(call(app, "/api/trips/berlin", "a"))).dreams[1].image.file;
  await call(app, "/api/trips/berlin/changes", "a", "POST", { baseRevision: 5, ops: [{ op: "remove", path: "dreams/1" }], reason: "x" });
  assert.ok(await store.file(commons), "a Commons file stays while the cache has it");
});

// REQ: DB-11 a title already looked up is answered from the cache and shares the file; "nothing found" expires after 30 days
test("DB-11 the shared cache", async () => {
  const calls: string[] = [];
  let now = new Date("2026-11-01T10:00:00Z");
  const store = memoryStore([trip(), trip("paris")]);
  const app = createApp(store, tokens, { fetch: wikimedia({ "berlin zoo": {} }, calls), now: () => now });
  await auto(app, "zoo");
  const asked = calls.length;
  await auto(app, "zoo", "a", "paris");
  assert.equal(calls.length, asked, "the second trip asks Wikimedia nothing");
  const [a, b] = await Promise.all(["berlin", "paris"].map(async (id) => (await json(call(app, `/api/trips/${id}`, "a"))).dreams[0].image.file));
  assert.equal(a, b);
  assert.equal((await call(app, `/api/trips/paris/files/${b}`, "a")).status, 200, "a shared file is served to every trip that uses it");
  await auto(app, "nix");
  const before = calls.length;
  await auto(app, "nix", "a", "paris");
  assert.equal(calls.length, before, "nothing found is remembered too");
  now = new Date("2026-12-02T10:00:00Z");
  await call(app, "/api/trips/paris/changes", "a", "POST", { baseRevision: 3, ops: [{ op: "remove", path: "dreams/2/imageTried" }], reason: "x" });
  await auto(app, "nix", "a", "paris");
  assert.ok(calls.length > before, "after 30 days it is asked again");
});

// REQ: DB-12 an own photo is uploaded by a role with Ändra on wishes, checked as in DB-08
test("DB-12 uploading an own photo", async () => {
  const app = createApp(memoryStore([trip()]), tokens, { fetch: wikimedia() });
  const bo = await person(app, "berlin", "bo", "traveler");
  assert.equal((await upload(app, "zoo", JPEG, bo)).status, 403);
  const webp = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBP"), 1]);
  assert.equal((await upload(app, "zoo", webp, "a", "image/webp")).status, 200);
});

// REQ: DB-13 the superuser empties the image cache of ended trips: Commons images go, own photos stay, unused files and entries go
test("DB-13 emptying the cache of ended trips", async () => {
  const store = memoryStore([trip("berlin", "2026-10-25"), trip("paris", "2026-12-20")]);
  const app = createApp(store, tokens, { fetch: wikimedia(), now: () => new Date("2026-11-01T10:00:00Z") });
  await auto(app, "zoo"); await auto(app, "zoo", "a", "paris"); // the same file in an ended and a coming trip
  await upload(app, "nix", JPEG);
  const before = await json(call(app, "/api/trips/berlin", "a"));
  const anna = await person(app, "berlin", "anna", "planner");
  assert.equal((await call(app, "/api/image-cache/ended", anna)).status, 403);
  assert.deepEqual(await json(call(app, "/api/image-cache/ended", "a")), { trips: 1, images: 1, files: 0, bytes: 0 }, "the file is still used by the coming trip");
  assert.deepEqual(await json(call(app, "/api/image-cache/ended", "a", "POST")), { trips: 1, images: 1, files: 0, bytes: 0 });
  const after = await json(call(app, "/api/trips/berlin", "a"));
  assert.deepEqual([after.dreams[0].image, after.dreams[0].imageTried, after.dreams[2].image.kind], [undefined, true, "own"]);
  assert.ok(await store.file(before.dreams[0].image.file), "still used by Paris");
  await call(app, "/api/trips/paris/changes", "a", "POST", { baseRevision: 2, ops: [{ op: "remove", path: "dreams/0" }], reason: "x" });
  assert.deepEqual(await json(call(app, "/api/image-cache/ended", "a")), { trips: 1, images: 0, files: 1, bytes: PNG.length });
  await call(app, "/api/image-cache/ended", "a", "POST");
  assert.equal(await store.file(before.dreams[0].image.file), undefined, "no trip uses it any more");
  assert.equal((await store.imageCache()).filter((e) => e.found).length, 0);
});

// REQ: DB-10 only Ändra on wishes sets images; a hidden wish reaches the viewer without link and image
test("DB-10 who may set images, and hidden wishes", async () => {
  const app = createApp(memoryStore([trip()]), tokens, { fetch: wikimedia() });
  const bo = await person(app, "berlin", "bo", "traveler"), anna = await person(app, "berlin", "anna", "planner");
  assert.equal((await auto(app, "zoo", bo)).status, 403);
  assert.equal((await call(app, "/api/trips/berlin/dreams/zoo/image/find", bo, "POST", { query: "Berlin Zoo" })).status, 403);
  assert.equal((await upload(app, "tarta-w", JPEG, anna)).status, 200);
  const file = (await json(call(app, "/api/trips/berlin", "a"))).dreams[1].image.file;
  const seen = await json(call(app, "/api/trips/berlin", bo));
  assert.deepEqual([seen.dreams[1].hidden, seen.dreams[1].image], [true, undefined]);
  assert.equal((await call(app, `/api/trips/berlin/files/${file}`, bo)).status, 404);
  assert.equal((await call(app, `/api/trips/berlin/files/${file}`, anna)).status, 200);
});

// REQ: DB-05 a wish's link is http or https
test("DB-05 a wish's link", () => {
  assert.throws(() => memoryStore([{ ...trip(), dreams: [{ ...trip().dreams[0], url: "javascript:alert(1)" }] }]));
  assert.ok(memoryStore([{ ...trip(), dreams: [{ ...trip().dreams[0], url: "https://zoo.example.org/" }] }]));
});
