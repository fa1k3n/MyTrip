// The transport panel behind the clock (TR-01..TR-08).
import type { Trip } from "@trip/schema";
import { sv } from "./sv.ts";

import { routeOf, type Route } from "@trip/schema/src/route.ts";
export { routeOf, type Route };

/** The API's answer for a day's traffic check (TR-09..TR-16). */
export type Traffic =
  | { status: "off" } | { status: "none" } | { status: "error" }
  | { status: "ok" | "warn"; delayMin: number; jam: boolean; durationMin: number };

type Day = Pick<Trip["days"][number], "legs">;

const icons: Record<string, string> = { car: "🚗", ferry: "🚢", train: "🚆", transit: "🚇", walk: "🚶" };
const motorised = ["car", "ferry", "train"];

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Total time per vehicle, identified by icon only (TR-01, TR-02). Days without a motorised leg show transit and walking (TR-05). */
export function vehicleTimes(day: Day): { icon: string; text: string }[] {
  const legs = day.legs.filter((l) => motorised.includes(l.vehicle));
  if (!legs.length) return [{ icon: "🚇🚶", text: sv.noTime }];
  const sums = new Map<string, number | null>();
  for (const l of legs) {
    const prev = sums.get(l.vehicle);
    sums.set(l.vehicle, prev === null || l.durationMin === undefined ? null : (prev ?? 0) + l.durationMin);
  }
  return [...sums].map(([v, m]) => ({ icon: icons[v], text: m === null ? sv.noTime : `ca ${fmtDuration(m)}` }));
}

const enc = encodeURIComponent;
/** Embedded map with the live traffic layer (TR-06). */
export const mapEmbedUrl = (r: Route) =>
  `https://maps.google.com/maps?saddr=${enc(r.origin)}&daddr=${[...r.waypoints, r.destination].map(enc).join("+to:")}&layer=t&output=embed`;

/** The same route, with its waypoints, in Google Maps (TR-08). */
export function directionsUrl(r: Route) {
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("origin", r.origin);
  u.searchParams.set("destination", r.destination);
  if (r.waypoints.length) u.searchParams.set("waypoints", r.waypoints.join("|"));
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}
