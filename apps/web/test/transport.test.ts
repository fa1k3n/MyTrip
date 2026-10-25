import { test } from "node:test";
import assert from "node:assert/strict";
import { directionsUrl, fmtDuration, mapEmbedUrl, routeOf, vehicleTimes } from "../src/transport.ts";

const leg = (vehicle: string, origin: string, destination: string, durationMin?: number, waypoints: string[] = []) => ({ vehicle, origin, destination, durationMin, waypoints });
const day = { legs: [
  leg("car", "Malmö", "Rødbyhavn", 150), leg("ferry", "Rødbyhavn", "Puttgarden", 45), leg("car", "Puttgarden", "Berlin", 210, ["Lübeck"]),
] } as never;

// REQ: TR-03 durations
test("TR-03 fmtDuration", () => {
  assert.equal(fmtDuration(45), "45 min");
  assert.equal(fmtDuration(360), "6 h");
  assert.equal(fmtDuration(210), "3 h 30 min");
});

// REQ: TR-01 TR-02 total travel time per vehicle, icon only
test("TR-01 TR-02 vehicleTimes", () => {
  assert.deepEqual(vehicleTimes(day), [{ icon: "🚗", text: "ca 6 h" }, { icon: "🚢", text: "ca 45 min" }]);
});

// REQ: TR-05 a day without a motorised leg shows transit and walking, without times
test("TR-05 vehicleTimes without motorised legs", () => {
  assert.deepEqual(vehicleTimes({ legs: [leg("walk", "A", "B")] } as never), [{ icon: "🚇🚶", text: "tid ej beräknad" }]);
  assert.deepEqual(vehicleTimes({ legs: [] } as never), [{ icon: "🚇🚶", text: "tid ej beräknad" }]);
  assert.equal(routeOf({ legs: [leg("walk", "A", "B")] } as never), null);
});

// REQ: TR-07 the route runs through every stop and waypoint in order
test("TR-07 routeOf", () => {
  assert.deepEqual(routeOf(day), { origin: "Malmö", destination: "Berlin", waypoints: ["Rødbyhavn", "Puttgarden", "Lübeck"] });
});

// REQ: TR-06 TR-08 the embedded map has the traffic layer and the external link keeps the waypoints
test("TR-06 TR-08 map and directions links", () => {
  const r = routeOf(day)!;
  const embed = mapEmbedUrl(r);
  assert.ok(embed.startsWith("https://maps.google.com/maps?"));
  assert.ok(embed.includes("layer=t") && embed.includes("output=embed"));
  assert.ok(embed.includes("daddr=R%C3%B8dbyhavn+to:Puttgarden+to:L%C3%BCbeck+to:Berlin"));
  const u = new URL(directionsUrl(r));
  assert.equal(u.searchParams.get("origin"), "Malmö");
  assert.equal(u.searchParams.get("destination"), "Berlin");
  assert.equal(u.searchParams.get("waypoints"), "Rødbyhavn|Puttgarden|Lübeck");
  assert.equal(u.searchParams.get("travelmode"), "driving");
});

// REQ: AU-28 no route map for a day whose route is hidden
test("AU-28 a day with a hidden route has no map", () => {
  assert.equal(routeOf({ ...(day as object), hiddenRoute: true } as never), null);
});
