import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import { departureIso, verdict } from "../src/traffic.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const trip = {
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], places: [], bookings: [], tasks: [], travelers: [],
  days: [
    { id: "d1", date: "2026-10-27", title: "Malmö – Berlin", summary: "S.", icons: ["🚗"], start: "08:00", end: "17:00", activities: [],
      legs: [{ vehicle: "car", origin: "Malmö", destination: "Berlin", departure: "08:00", durationMin: 360, waypoints: ["Lübeck"] }] },
    { id: "d2", date: "2026-10-28", title: "Berlin", summary: "S.", icons: ["🚇"], start: "09:00", end: "17:00", activities: [], legs: [{ vehicle: "walk", origin: "A", destination: "B" }] },
  ],
};
const now = new Date("2026-10-25T10:00:00Z");

// REQ: TR-10 departure in the trip's time zone, or now plus one minute when it has passed
test("TR-10 departureIso", () => {
  assert.equal(departureIso("2026-10-27", "08:00", "Europe/Berlin", now), "2026-10-27T07:00:00.000Z");
  assert.equal(departureIso("2026-10-20", "08:00", "Europe/Berlin", now), "2026-10-25T10:01:00.000Z");
});

// REQ: TR-11 TR-12 TR-13 TR-14 delays over the threshold and jams warn; advisories do not
test("TR-11 TR-12 TR-13 TR-14 verdict", () => {
  assert.deepEqual(verdict({ duration: "21600s", staticDuration: "21000s", speedReadingIntervals: [] }, 10), { status: "warn", delayMin: 10, jam: false, durationMin: 360 });
  assert.deepEqual(verdict({ duration: "21300s", staticDuration: "21000s", speedReadingIntervals: [{ speed: "TRAFFIC_JAM" }] }, 10), { status: "warn", delayMin: 5, jam: true, durationMin: 355 });
  assert.deepEqual(verdict({ duration: "21300s", staticDuration: "21000s", speedReadingIntervals: [{ speed: "SLOW" }], travelAdvisory: { tollInfo: {} } }, 10), { status: "ok", delayMin: 5, jam: false, durationMin: 355 });
});

const get = (app: ReturnType<typeof createApp>, day: string) =>
  app.request(`/api/trips/berlin/days/${day}/traffic`, { headers: { authorization: "Bearer r" } });

// REQ: TR-15 without a routing key the check is off
test("TR-15 traffic is off without a key", async () => {
  const res = await get(createApp(memoryStore([trip]), tokens), "d1");
  assert.deepEqual(await res.json(), { status: "off" });
});

// REQ: TR-09 TR-17 SP-01 the server asks the routing service with its own key, the configured threshold and the route's waypoints
test("TR-09 TR-17 SP-01 traffic check through the server", async () => {
  let sent: { url: string; headers: Record<string, string>; body: { intermediates: { address: string }[]; departureTime: string } } | undefined;
  const fakeFetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    sent = { url, headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ routes: [{ duration: "22200s", staticDuration: "21600s", travelAdvisory: { speedReadingIntervals: [] } }] }));
  };
  const app = createApp(memoryStore([trip]), tokens, { routesKey: "secret", trafficThresholdMin: 15, fetch: fakeFetch as never, now: () => now });
  const res = await get(app, "d1");
  assert.deepEqual(await res.json(), { status: "ok", delayMin: 10, jam: false, durationMin: 370 }); // 10 min < 15
  assert.equal(sent!.headers["X-Goog-Api-Key"], "secret");
  assert.deepEqual(sent!.body.intermediates, [{ address: "Lübeck" }]);
  assert.equal(sent!.body.departureTime, "2026-10-27T07:00:00.000Z");
});

// REQ: TR-16 a failed request is a neutral error; TR-05 a day without driving has no check
test("TR-16 TR-05 failures and days without driving", async () => {
  const failing = async () => new Response("nope", { status: 500 });
  const app = createApp(memoryStore([trip]), tokens, { routesKey: "secret", fetch: failing as never, now: () => now });
  assert.deepEqual(await (await get(app, "d1")).json(), { status: "error" });
  assert.deepEqual(await (await get(app, "d2")).json(), { status: "none" });
  assert.equal((await get(app, "nope")).status, 404);
});
