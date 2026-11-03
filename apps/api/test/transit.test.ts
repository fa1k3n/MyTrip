import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import { transitSteps } from "../src/transit.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const trip = () => ({
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", stops: [], tasks: [], bookings: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }],
  places: [{ id: "hotel", name: "Hotell Mitte", address: "Exempelstraße 1, 10115 Berlin" }, { id: "zoo", name: "Zoo", address: "Hardenbergplatz 8, 10787 Berlin" }],
  days: [{ id: "d1", date: "2026-11-20", title: "Dag", summary: "S.", icons: ["Natur"], start: "09:00", end: "18:00", activities: [
    { id: "a1", text: "Frukost", placeIds: ["hotel"] },
    { id: "a2", text: "Zoo", start: "10:30", placeIds: ["zoo"], travel: { vehicle: "transit", durationMin: 25 } },
    { id: "a3", text: "Promenad", placeIds: [], travel: { vehicle: "walk", durationMin: 10 } }] }],
});
/** A Routes answer with a walk, a metro ride, a walk. */
const answer = { routes: [{ legs: [{ steps: [
  { travelMode: "WALK", staticDuration: "180s" }, { travelMode: "WALK", staticDuration: "60s" },
  { travelMode: "TRANSIT", staticDuration: "900s", transitDetails: {
    stopDetails: { departureStop: { name: "Rosenthaler Platz" }, arrivalStop: { name: "Zoologischer Garten" } },
    localizedValues: { departureTime: { time: { text: "10:02" } }, arrivalTime: { time: { text: "10:17" } } },
    headsign: "Ruhleben", stopCount: 9, transitLine: { nameShort: "U2", name: "U2", vehicle: { type: "SUBWAY" } } } },
  { travelMode: "WALK", staticDuration: "240s" }] }] }] };

// REQ: TR-23 the steps: walking minutes, and each ride with line, kind, direction, stops and local times
test("TR-23 a Routes answer becomes walking and ride steps", () => {
  assert.deepEqual(transitSteps(answer), [
    { kind: "walk", min: 4 },
    { kind: "ride", line: "U2", vehicle: "metro", headsign: "Ruhleben", from: "Rosenthaler Platz", to: "Zoologischer Garten", dep: "10:02", arr: "10:17", stops: 9 },
    { kind: "walk", min: 4 }]);
  assert.equal(transitSteps({}), null);
  assert.deepEqual(transitSteps({ routes: [{ legs: [{ steps: [{ travelMode: "WALK", staticDuration: "600s" }] }] }] }), [{ kind: "walk", min: 10 }]); // walking all the way
});

// REQ: TR-23 the server asks Google Routes by transit from the place before, arriving by the start; without a key it is off
test("TR-23 the endpoint asks Routes TRANSIT with the same ends as TR-21", async () => {
  let asked: { url: string; body: Record<string, unknown>; mask: string } | undefined;
  const fetch = (async (url: string, init: RequestInit) => {
    asked = { url, body: JSON.parse(String(init.body)), mask: String((init.headers as Record<string, string>)["X-Goog-FieldMask"]) };
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as typeof globalThis.fetch;
  const app = createApp(memoryStore([trip()]), tokens, { routesKey: "k", fetch, now: () => new Date("2026-11-19T12:00:00Z") });
  const r = await app.request("/api/trips/berlin/days/d1/activities/a2/transit", { headers: { authorization: "Bearer a" } });
  assert.equal(r.status, 200, await r.clone().text());
  const b = await r.json();
  assert.equal(b.status, "ok");
  assert.equal(b.steps[1].line, "U2");
  assert.equal(asked!.body.travelMode, "TRANSIT");
  assert.deepEqual(asked!.body.origin, { address: "Hotell Mitte, Exempelstraße 1, 10115 Berlin" });
  assert.deepEqual(asked!.body.destination, { address: "Zoo, Hardenbergplatz 8, 10787 Berlin" });
  assert.equal(asked!.body.arrivalTime, "2026-11-20T09:30:00.000Z"); // 10.30 in Berlin
  assert.ok(asked!.mask.includes("transitDetails"));
  const walk = await app.request("/api/trips/berlin/days/d1/activities/a3/transit", { headers: { authorization: "Bearer a" } });
  assert.equal((await walk.json()).status, "none"); // not by public transport, no place
  const off = createApp(memoryStore([trip()]), tokens, {});
  assert.equal((await (await off.request("/api/trips/berlin/days/d1/activities/a2/transit", { headers: { authorization: "Bearer a" } })).json()).status, "off");
});

// REQ: TR-23 a start that has passed: leave now
test("TR-23 leaves now when the start has passed", async () => {
  let body: Record<string, unknown> = {};
  const fetch = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(JSON.stringify({ routes: [] }), { status: 200 }); }) as typeof globalThis.fetch;
  const app = createApp(memoryStore([trip()]), tokens, { routesKey: "k", fetch, now: () => new Date("2026-11-20T11:00:00Z") });
  const b = await (await app.request("/api/trips/berlin/days/d1/activities/a2/transit", { headers: { authorization: "Bearer a" } })).json();
  assert.equal(body.arrivalTime, undefined);
  assert.equal(body.departureTime, "2026-11-20T11:01:00.000Z");
  assert.equal(b.status, "none"); // no trip found
});

// REQ: TR-23 without a place before, the phone's position is the start; without it, the server asks for it
test("TR-23 the first activity of the day starts from the phone's position", async () => {
  let body: Record<string, unknown> = {};
  const fetch = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(JSON.stringify(answer), { status: 200 }); }) as typeof globalThis.fetch;
  const t = trip();
  t.days[0]!.activities = [t.days[0]!.activities[1]!]; // the bus is the day's first activity, and no stay is booked
  const app = createApp(memoryStore([t]), tokens, { routesKey: "k", fetch, now: () => new Date("2026-11-19T12:00:00Z") });
  const ask = (q = "") => app.request(`/api/trips/berlin/days/d1/activities/a2/transit${q}`, { headers: { authorization: "Bearer a" } });
  assert.deepEqual(await (await ask()).json(), { status: "nofrom" });
  const r = await (await ask("?from=52.5321,13.4013")).json();
  assert.equal(r.status, "ok");
  assert.deepEqual(body.origin, { location: { latLng: { latitude: 52.5321, longitude: 13.4013 } } });
  assert.equal((await ask("?from=inte,en,plats")).status, 400);
});

// REQ: TR-23 an error from Google is logged with its status
test("TR-23 a Routes error is logged", async () => {
  const fetch = (async () => new Response('{"error":{"message":"API key not valid"}}', { status: 403 })) as unknown as typeof globalThis.fetch;
  const app = createApp(memoryStore([trip()]), tokens, { routesKey: "k", fetch, now: () => new Date("2026-11-19T12:00:00Z") });
  const logged: string[] = [], was = console.error;
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  try {
    const b = await (await app.request("/api/trips/berlin/days/d1/activities/a2/transit", { headers: { authorization: "Bearer a" } })).json();
    assert.equal(b.status, "error");
  } finally { console.error = was; }
  assert.ok(logged.some((l) => l.includes("403") && l.includes("API key not valid")), logged.join("\n"));
});

// REQ: TR-24 far ahead without a timetable: the same time on the nearest same weekday from today, marked as an example
test("TR-24 far ahead, the nearest same weekday is shown as an example", async () => {
  const asked: Record<string, unknown>[] = [];
  const fetch = (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body)); asked.push(b);
    return new Response(JSON.stringify(b.arrivalTime < "2026-11-01" ? answer : { routes: [] }), { status: 200 });
  }) as typeof globalThis.fetch;
  // a Wednesday: today is Wednesday 2026-10-14, the activity on Friday 2026-11-20
  const app = createApp(memoryStore([trip()]), tokens, { routesKey: "k", fetch, now: () => new Date("2026-10-14T08:00:00Z") });
  const b = await (await app.request("/api/trips/berlin/days/d1/activities/a2/transit", { headers: { authorization: "Bearer a" } })).json();
  assert.equal(asked.length, 2);
  assert.equal(asked[0]!.arrivalTime, "2026-11-20T09:30:00.000Z");
  assert.equal(asked[1]!.arrivalTime, "2026-10-16T08:30:00.000Z"); // Friday 16 October, 10.30 in Berlin (summer time)
  assert.equal(b.status, "ok");
  assert.equal(b.example, "2026-10-16");
  assert.equal(b.steps[1].line, "U2");
});

// REQ: TR-24 far ahead and no example either: "none" says the date is far ahead; near, or with a route, nothing more is asked
test("TR-24 far ahead without any trip, and near dates ask once", async () => {
  let n = 0;
  const none = (async () => { n++; return new Response(JSON.stringify({ routes: [] }), { status: 200 }); }) as unknown as typeof globalThis.fetch;
  const far = createApp(memoryStore([trip()]), tokens, { routesKey: "k", fetch: none, now: () => new Date("2026-10-14T08:00:00Z") });
  assert.deepEqual(await (await far.request("/api/trips/berlin/days/d1/activities/a2/transit", { headers: { authorization: "Bearer a" } })).json(), { status: "none", far: true });
  assert.equal(n, 2);
  n = 0;
  const near = createApp(memoryStore([trip()]), tokens, { routesKey: "k", fetch: none, now: () => new Date("2026-11-10T08:00:00Z") }); // ten days before
  assert.deepEqual(await (await near.request("/api/trips/berlin/days/d1/activities/a2/transit", { headers: { authorization: "Bearer a" } })).json(), { status: "none" });
  assert.equal(n, 1);
});

// REQ: TR-27 the answer names the place the trip is counted from; from the phone's position it names none
test("TR-27 the answer says where the trip starts", async () => {
  const fetch = (async () => new Response(JSON.stringify(answer), { status: 200 })) as unknown as typeof globalThis.fetch;
  const t = trip(), first = trip();
  first.days[0]!.activities = [first.days[0]!.activities[1]!];
  const app = createApp(memoryStore([t]), tokens, { routesKey: "k", fetch, now: () => new Date("2026-11-19T12:00:00Z") });
  assert.equal((await (await app.request("/api/trips/berlin/days/d1/activities/a2/transit", { headers: { authorization: "Bearer a" } })).json()).from, "Hotell Mitte");
  const here = createApp(memoryStore([first]), tokens, { routesKey: "k", fetch, now: () => new Date("2026-11-19T12:00:00Z") });
  const r = await (await here.request("/api/trips/berlin/days/d1/activities/a2/transit?from=52.5321,13.4013", { headers: { authorization: "Bearer a" } })).json();
  assert.deepEqual([r.status, r.from], ["ok", undefined]);
});
