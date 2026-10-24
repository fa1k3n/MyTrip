import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const trip = () => ({
  id: "berlin", revision: 1, title: "Berlin", purpose: "Höstlov", timezone: "Europe/Berlin", image: "berlin.jpg",
  stops: [], places: [], tasks: [], travelers: [], dreams: [], budget: [],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "Sammanfattning.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
  bookings: [{ id: "hotel", name: "Hotel", from: "2026-10-25", to: "2026-10-25", status: "paid", reference: "XY-1" }],
});
const setup = () => {
  const store = memoryStore([trip()], { "berlin.jpg": new Uint8Array([0xff, 0xd8, 0xff]) });
  return { store, app: createApp(store, tokens) };
};
const req = (app: ReturnType<typeof createApp>, path: string, token: string, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const rename = (baseRevision: number, extra: object = {}) =>
  ({ baseRevision, ops: [{ op: "set", path: "title", value: "Nytt namn" }], reason: "test", ...extra });

// REQ: MC-10 calls without a valid token are rejected
test("MC-10 rejects unknown tokens", async () => {
  assert.equal((await setup().app.request("/api/trips")).status, 401);
});

// REQ: MT-01 the hub lists every trip
test("MT-01 lists all trips", async () => {
  const res = await req(setup().app, "/api/trips", "r");
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.deepEqual(list.map((t: { id: string }) => t.id), ["berlin"]);
});

// REQ: MC-11 booking references are hidden from read-only tokens
test("MC-11 read token does not see booking references", async () => {
  const { app } = setup();
  const one = await (await req(app, "/api/trips/berlin", "r")).json();
  assert.equal(one.bookings[0].reference, undefined);
  const all = await (await req(app, "/api/trips", "r")).json();
  assert.equal(all[0].bookings[0].reference, undefined);
  assert.equal((await (await req(app, "/api/trips/berlin", "a")).json()).bookings[0].reference, "XY-1");
});

// REQ: MT-01 unknown trips give 404
test("MT-01 unknown trip is 404", async () => {
  assert.equal((await req(setup().app, "/api/trips/nope", "a")).status, 404);
});

// REQ: MT-02 an admin creates a trip from a title; others may not
test("MT-02 admin creates a trip", async () => {
  const { app } = setup();
  assert.equal((await req(app, "/api/trips", "p", { method: "POST", body: { title: "Ny resa" } })).status, 403);
  assert.equal((await req(app, "/api/trips", "a", { method: "POST", body: { title: " " } })).status, 400);
  const res = await req(app, "/api/trips", "a", { method: "POST", body: { title: "Sommar i Skåne" } });
  assert.equal(res.status, 201);
  const t = await res.json();
  assert.match(t.id, /^sommar-i-skane-[a-z0-9]+$/);
  assert.deepEqual([t.revision, t.days, t.dreams, t.purpose], [1, [], [], ""]);
  assert.equal((await req(app, `/api/trips/${t.id}`, "r")).status, 200);
});

// REQ: MT-03 only an admin deletes a trip
test("MT-03 admin deletes a trip", async () => {
  const { app } = setup();
  assert.equal((await req(app, "/api/trips/berlin", "p", { method: "DELETE" })).status, 403);
  assert.equal((await req(app, "/api/trips/berlin", "a", { method: "DELETE" })).status, 204);
  assert.equal((await req(app, "/api/trips/berlin", "a")).status, 404);
});

// REQ: MT-01 the cover image is served with its content type
test("MT-01 serves the cover image", async () => {
  const res = await req(setup().app, "/api/trips/berlin/image", "r");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal((await res.arrayBuffer()).byteLength, 3);
});

// REQ: MC-10 read-only tokens cannot write
test("MC-10 read token cannot propose changes", async () => {
  assert.equal((await req(setup().app, "/api/trips/berlin/changes", "r", { method: "POST", body: rename(1) })).status, 403);
});

// REQ: MC-05 a change based on an old revision is a conflict
test("MC-05 stale revision gives 409", async () => {
  const res = await req(setup().app, "/api/trips/berlin/changes", "a", { method: "POST", body: rename(0) });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).revision, 1);
});

// REQ: MC-04 a dry run reports the result and saves nothing
test("MC-04 dry run does not save", async () => {
  const { app, store } = setup();
  const res = await req(app, "/api/trips/berlin/changes", "a", { method: "POST", body: rename(1, { dryRun: true }) });
  assert.deepEqual(await res.json(), { ok: true, problems: [], summary: ["set title"] });
  assert.equal((await store.load("berlin"))!.title, "Berlin");
});

// REQ: MC-03 an invalid change is rejected and names the failing field
test("MC-03 invalid change is rejected with the field name", async () => {
  const res = await req(setup().app, "/api/trips/berlin/changes", "a", {
    method: "POST", body: { baseRevision: 1, ops: [{ op: "set", path: "days/0/title", value: "" }] },
  });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).problems.some((p: string) => p.startsWith("days/0/title")));
});

// REQ: MC-06 changes from a propose token wait for approval; MC-08 applied changes are logged
test("MC-06 MC-08 proposals are applied only after admin approval", async () => {
  const { app, store } = setup();
  const res = await req(app, "/api/trips/berlin/changes", "p", { method: "POST", body: rename(1) });
  assert.equal(res.status, 202);
  const { proposalId } = await res.json();
  assert.equal((await store.load("berlin"))!.title, "Berlin");
  assert.equal((await req(app, `/api/trips/berlin/proposals/${proposalId}/approve`, "p", { method: "POST" })).status, 403);
  const ok = await req(app, `/api/trips/berlin/proposals/${proposalId}/approve`, "a", { method: "POST" });
  assert.equal((await ok.json()).proposal.status, "approved");
  const saved = (await store.load("berlin"))!;
  assert.deepEqual([saved.title, saved.revision], ["Nytt namn", 2]);
  const log = await (await req(app, "/api/log", "a")).json();
  assert.deepEqual(log.map((e: { actor: string; tripId: string }) => [e.actor, e.tripId]), [["llm", "berlin"]]);
});

// REQ: DB-02 an admin change is applied at once and returns the new revision
test("DB-02 admin change is applied directly", async () => {
  const { app, store } = setup();
  const res = await req(app, "/api/trips/berlin/changes", "a", { method: "POST", body: rename(1) });
  assert.deepEqual(await res.json(), { revision: 2 });
  assert.equal((await store.load("berlin"))!.title, "Nytt namn");
});
