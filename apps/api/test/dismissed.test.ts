import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const dismissed = [{ text: "Natten 25–26 okt saknar boende.", reason: "Överraskning hos mormor", by: "Anna", at: "2026-10-01T10:00:00.000Z" }];
const trip = {
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], places: [], packing: [], tasks: [], bookings: [], dismissed,
  travelers: [{ id: "anna", name: "Anna", packing: [] }, { id: "bo", name: "Bo", packing: [] }],
  days: [{ id: "d1", date: "2026-10-25", title: "Dag", summary: "S.", icons: ["🚗"], start: "08:00", end: "18:00", activities: [] }],
};
const call = (app: ReturnType<typeof createApp>, path: string, auth: string, method = "GET", body?: unknown) =>
  app.request(path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body) });

// REQ: DQ-11 dismissed warnings reach only those who may dismiss them, so their texts give nothing away; only a Planerare changes them
test("DQ-11 dismissed warnings for planners only", async () => {
  const app = createApp(memoryStore([trip]), tokens);
  const link = async (id: string, role: string) => `person.berlin.${id}.${(await (await call(app, `/api/trips/berlin/people/${id}`, "a", "PUT", { role })).json()).secret}`;
  const planner = await link("anna", "planner"), traveler = await link("bo", "traveler");
  assert.deepEqual((await (await call(app, "/api/trips/berlin", planner)).json()).dismissed, dismissed);
  assert.equal((await (await call(app, "/api/trips/berlin", traveler)).json()).dismissed, undefined);
  const ops = [{ op: "remove", path: "dismissed/0" }];
  assert.equal((await call(app, "/api/trips/berlin/changes", traveler, "POST", { baseRevision: 1, ops, reason: "x" })).status, 403);
  assert.equal((await call(app, "/api/trips/berlin/changes", planner, "POST", { baseRevision: 1, ops, reason: "x" })).status, 200);
});
