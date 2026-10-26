import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, memoryStore, type Store } from "../src/app.ts";
import { fileStore } from "../src/file-store.ts";
import { d1Store } from "../src/d1-store.ts";
import { sqliteD1 } from "./helpers/sqlite-d1.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, auth: string, method = "GET", body?: unknown) => app.request(path, {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (r: Response | Promise<Response>) => (await r).json();
const upload = (app: App, auth: string, bytes: Uint8Array<ArrayBuffer>, type: string, name = "biljett.pdf") =>
  app.request(`/api/trips/berlin/files?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": type, authorization: `Bearer ${auth}` }, body: bytes });
const person = async (app: App, travelerId: string, role: string) =>
  `person.berlin.${travelerId}.${(await json(call(app, `/api/trips/berlin/people/${travelerId}`, "a", "PUT", { role }))).secret}`;
const follower = async (app: App) => `link.berlin.${(await json(call(app, "/api/trips/berlin/link", "a", "POST"))).secret}`;
const change = async (app: App, auth: string, ops: unknown[]) => call(app, "/api/trips/berlin/changes", auth, "POST",
  { baseRevision: (await json(call(app, "/api/trips/berlin", "a"))).revision, ops, reason: "test" });

const pdf = new TextEncoder().encode("%PDF-1.4\n% fictional ticket\n%%EOF\n");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

/** Liseberg is a surprise for Anna; its ticket is linked to it. The hotel is not hidden. */
const trip = () => ({
  id: "berlin", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Göteborg", summary: "Stad", icons: ["🎢"], start: "08:00", end: "18:00", activities: [
    { id: "a1", text: "Nöjespark", placeIds: [], start: "10:00", hiddenFrom: ["anna"] }] }],
  bookings: [
    { id: "hotel", name: "Hotell", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "XY-1", kind: "stay" },
    { id: "tix", name: "Entré", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "LB-1", kind: "ticket", activityId: "a1" },
  ],
});
/** Uploads a file and puts it on a booking; returns its id. */
async function attach(app: App, bookingIndex: number, bytes = pdf, type = "application/pdf") {
  const f = await json(upload(app, "a", bytes, type));
  const t = await json(call(app, "/api/trips/berlin", "a"));
  const b = t.bookings[bookingIndex];
  assert.equal((await change(app, "a", [{ op: "set", path: `bookings/${bookingIndex}`, value: { ...b, files: [...(b.files ?? []), f] } }])).status, 200);
  return f.id as string;
}

// REQ: BK-09 a Planerare or the superuser uploads PDF, PNG or JPEG of at most 2 MB; the content must match the type
test("BK-09 uploading ticket files", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const r = await upload(app, "a", pdf, "application/pdf");
  assert.equal(r.status, 201);
  const f = await r.json();
  assert.match(f.id, /^[a-z0-9]{16,40}$/);
  assert.deepEqual({ ...f, id: "" }, { id: "", name: "biljett.pdf", type: "application/pdf", size: pdf.length });
  assert.equal((await upload(app, await person(app, "bo", "planner"), png, "image/png", "kod.png")).status, 201);
  assert.equal((await upload(app, "a", jpg, "image/jpeg", "kod.jpg")).status, 201);
  assert.equal((await upload(app, await person(app, "anna", "traveler"), pdf, "application/pdf")).status, 403, "a Resenär does not");
  assert.equal((await upload(app, "a", new TextEncoder().encode("<html>"), "text/html")).status, 415);
  assert.equal((await upload(app, "a", new TextEncoder().encode("<html>"), "application/pdf")).status, 415, "not a PDF inside");
  assert.equal((await upload(app, "a", new Uint8Array(2 * 1024 * 1024 + 1).fill(0x25), "application/pdf")).status, 413);
});

// REQ: BK-11 a ticket file reaches only those who get its booking with the reference; a hidden activity's ticket is masked
test("BK-11 who may fetch a ticket file", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const hotel = await attach(app, 0), tix = await attach(app, 1);
  const get = async (auth: string, id: string) => call(app, `/api/trips/berlin/files/${id}`, auth);
  const r = await get("a", hotel);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/pdf");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), pdf);
  const bo = await person(app, "bo", "traveler"), anna = await person(app, "anna", "traveler");
  assert.equal((await get(bo, hotel)).status, 200);
  assert.equal((await get(bo, tix)).status, 200, "Bo may see the surprise");
  assert.equal((await get(anna, hotel)).status, 200);
  assert.equal((await get(anna, tix)).status, 404, "the ticket would give the surprise away");
  const seen = (await json(call(app, "/api/trips/berlin", anna))).bookings.find((b: { id: string }) => b.id === "tix");
  assert.equal(seen.hidden, true);
  assert.equal(seen.name, "");
  assert.equal(seen.files, undefined);
  assert.equal(seen.reference, "LB-1", "as in AU-30, the reference stays");
  // A Följare never gets files, even when the superuser lets it see bookings (AU-22).
  await change(app, "a", [{ op: "set", path: "access", value: { follower: { up: { parts: { bookings: "read" } } } } }]);
  const f = await follower(app);
  assert.equal((await json(call(app, "/api/trips/berlin", f))).bookings[0].files, undefined);
  assert.equal((await get(f, hotel)).status, 404);
  assert.equal((await get("r", hotel)).status, 404, "nor a read-only token (MC-11)");
  // Hidden bookings for the role: no files (AU-21).
  await change(app, "a", [{ op: "set", path: "access", value: { traveler: { nala: { parts: { bookings: "hidden" } }, up: { parts: { bookings: "hidden" } } } } }]);
  assert.equal((await get(bo, hotel)).status, 404);
  assert.equal((await get("a", "doesnotexist00000000")).status, 404);
});

// REQ: BK-13 a file is deleted when a change removes the last booking that uses it
test("BK-13 files go with their booking", async () => {
  const app = createApp(memoryStore([trip()]), tokens);
  const id = await attach(app, 0);
  const t = await json(call(app, "/api/trips/berlin", "a"));
  assert.equal((await change(app, "a", [{ op: "set", path: "bookings/0", value: { ...t.bookings[0], files: [] } }])).status, 200);
  assert.equal((await call(app, `/api/trips/berlin/files/${id}`, "a")).status, 404);
  const id2 = await attach(app, 1);
  assert.equal((await change(app, "a", [{ op: "remove", path: "bookings/1" }])).status, 200);
  assert.equal((await call(app, `/api/trips/berlin/files/${id2}`, "a")).status, 404);
});

// REQ: BK-13 every store keeps ticket files apart from the trip data; D1 in parts
test("BK-13 the stores keep files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trip-files-"));
  test.after(() => rm(dir, { recursive: true, force: true }));
  const big = new Uint8Array(250_000).map((_, i) => i % 251);
  for (const [name, store] of [["memory", memoryStore()], ["file", fileStore(dir)], ["d1", d1Store(sqliteD1())]] as [string, Store][]) {
    await store.saveFile({ id: "abcdef0123456789ab", tripId: "berlin", type: "application/pdf" }, big);
    const got = await store.file("abcdef0123456789ab");
    assert.equal(got?.tripId, "berlin", name);
    assert.equal(got?.type, "application/pdf", name);
    assert.deepEqual(got?.bytes, big, name);
    await store.removeFiles(["abcdef0123456789ab"]);
    assert.equal(await store.file("abcdef0123456789ab"), undefined, name);
    assert.equal(await store.file("../../etc/passwd"), undefined, name);
  }
});
