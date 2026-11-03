// The transport panel behind the clock (TR-01..TR-08).
import type { Trip } from "@trip/schema";
import { sv } from "./sv.ts";
import { dayLabel } from "./format.ts";

import { routeOf, wayEnds, type Route } from "@trip/schema/src/route.ts";
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

const MODES: Record<string, string> = { transit: "transit", train: "transit", walk: "walking", car: "driving", ferry: "driving" };
/** The way to an activity in Google Maps: from the place before it on the day, else the stay of the night before, else where the phone is (TR-21). */
export function wayUrl(t: Trip, dayId: string, activityId: string): string | undefined {
  const w = wayEnds(t, dayId, activityId);
  if (!w) return undefined;
  const q = new URLSearchParams({ api: "1", ...(w.from ? { origin: w.from } : {}), destination: w.to, travelmode: MODES[w.vehicle ?? ""] ?? "transit" });
  return `https://www.google.com/maps/dir/?${q}`;
}

/** A step of the trip by public transport, as the server sends it (TR-23). */
export type TransitStep = { kind: "walk"; min: number } | { kind: "ride"; line: string; vehicle: string; headsign?: string; from: string; to: string; dep?: string; arr?: string; stops?: number };
const clock = (t?: string) => (t ? `${t.replace(":", ".")} ` : "");
/** A step as one short line: "Gå 4 min", "Tunnelbana U2 mot Ruhleben: 10.02 A – 10.17 B, 9 hållplatser" (TR-23). */
export function stepText(s: TransitStep) {
  if (s.kind === "walk") return sv.transit.walk(s.min);
  const head = [sv.transit.kinds[s.vehicle] ?? sv.transit.kinds.other, s.line, s.headsign && sv.transit.toward(s.headsign)].filter(Boolean).join(" ");
  return `${head}: ${clock(s.dep)}${s.from} – ${clock(s.arr)}${s.to}${s.stops ? `, ${sv.transit.stops(s.stops)}` : ""}`;
}
/** The server's answer for "Visa linjer" (TR-23, TR-24). */
export type TransitAnswer = { status: "off" | "error" | "nofrom" } | { status: "none"; far?: true } | { status: "ok"; steps: TransitStep[]; example?: string; from?: string };
/** TR-27: where the trip is counted from, as the steps' first line: the place before or the stay, else the phone's position. */
export const transitFrom = (r: TransitAnswer) => (r.status !== "ok" ? undefined : r.from ? sv.transit.from(r.from) : sv.transit.fromHere);
/** What is said with or instead of the steps: none found, none so far ahead, or the trip of the nearest same weekday (TR-24). */
export function transitNote(r: TransitAnswer) {
  if (r.status === "ok") return r.example ? sv.transit.example(dayLabel(r.example)) : undefined;
  return r.status === "off" ? sv.transit.off : r.status === "none" && r.far ? sv.transit.far : sv.transit.none; // TR-25
}
/** The icon of a step, among the means of transport the app draws. */
export const stepIcon = (s: TransitStep) => (s.kind === "walk" ? "walk" : s.vehicle === "train" || s.vehicle === "ferry" ? s.vehicle : "transit");
