// Public transport to an activity, from Google Routes (TR-23). The routing key stays on the server (SP-01, SP-02), as for traffic (TR-15).
import { wayEnds, type Trip } from "@trip/schema";
import { zoned, type TrafficOpts } from "./traffic.ts";

export type Step =
  | { kind: "walk"; min: number }
  | { kind: "ride"; line: string; vehicle: string; headsign?: string; from: string; to: string; dep?: string; arr?: string; stops?: number };
// nofrom: no place before, the phone's position is needed; far: no trip on a date so far ahead that Google may have no timetable yet;
// example: the date of the nearest same weekday whose trip is shown instead (TR-24)
export type Transit = { status: "off" | "error" | "nofrom" } | { status: "none"; far?: true } | { status: "ok"; steps: Step[]; example?: string };

/** Google's kinds of vehicle as the app's: bus, tram, metro, train, ferry, or other. */
const KIND: Record<string, string> = {
  BUS: "bus", INTERCITY_BUS: "bus", TROLLEYBUS: "bus", SHARE_TAXI: "bus", TRAM: "tram", LIGHT_RAIL: "tram", MONORAIL: "tram",
  SUBWAY: "metro", METRO_RAIL: "metro", RAIL: "train", HEAVY_RAIL: "train", COMMUTER_TRAIN: "train", HIGH_SPEED_TRAIN: "train", LONG_DISTANCE_TRAIN: "train",
  FERRY: "ferry",
};
type Raw = { travelMode?: string; staticDuration?: string; transitDetails?: {
  stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string } };
  localizedValues?: { departureTime?: { time?: { text?: string } }; arrivalTime?: { time?: { text?: string } } };
  headsign?: string; stopCount?: number; transitLine?: { nameShort?: string; name?: string; vehicle?: { type?: string } } } };

/** The first route's steps: walks in a row as one, with whole minutes; each ride with its line, kind, direction, stops and local times.
 * Walking all the way is one walk. Null without a route. */
export function transitSteps(answer: unknown): Step[] | null {
  const legs = (answer as { routes?: { legs?: { steps?: Raw[] }[] }[] })?.routes?.[0]?.legs;
  if (!legs?.length) return null;
  const out: Step[] = [];
  let walk = 0;
  const flush = () => { if (walk) out.push({ kind: "walk", min: Math.max(1, Math.round(walk / 60)) }); walk = 0; };
  for (const s of legs.flatMap((l) => l.steps ?? [])) {
    const d = s.transitDetails;
    if (s.travelMode !== "TRANSIT" || !d) { walk += parseInt(s.staticDuration ?? "0", 10) || 0; continue; }
    flush();
    const line = d.transitLine?.nameShort || d.transitLine?.name || "";
    out.push({ kind: "ride", line, vehicle: KIND[d.transitLine?.vehicle?.type ?? ""] ?? "other",
      ...(d.headsign ? { headsign: d.headsign } : {}), from: d.stopDetails?.departureStop?.name ?? "", to: d.stopDetails?.arrivalStop?.name ?? "",
      ...(d.localizedValues?.departureTime?.time?.text ? { dep: d.localizedValues.departureTime.time.text } : {}),
      ...(d.localizedValues?.arrivalTime?.time?.text ? { arr: d.localizedValues.arrivalTime.time.text } : {}),
      ...(typeof d.stopCount === "number" ? { stops: d.stopCount } : {}) });
  }
  flush();
  return out.length ? out : null;
}

const MASK = "routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails";
/** Google often has no timetable more than about two weeks ahead (TR-24). */
const FAR_MS = 14 * 86_400_000;
/** The first date after today, in the trip's time zone, on the same weekday as `date`. */
export function nearestWeekday(date: string, now: number, timeZone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const day = (d: string) => new Date(`${d}T12:00:00Z`);
  const ahead = (day(date).getUTCDay() - day(today).getUTCDay() + 7) % 7 || 7;
  return new Date(day(today).getTime() + ahead * 86_400_000).toISOString().slice(0, 10);
}

/** Asks Routes for public transport to the activity, arriving by its start, or leaving now when that has passed (TR-23). Far ahead
 * without a trip, the same time on the nearest same weekday is asked for and shown as an example (TR-24). */
export async function checkTransit(t: Trip, dayId: string, activityId: string, o: TrafficOpts, here?: { lat: number; lng: number }): Promise<Transit> {
  const w = wayEnds(t, dayId, activityId);
  if (!w || (w.vehicle !== "transit" && w.vehicle !== "train")) return { status: "none" };
  if (!o.routesKey) return { status: "off" };
  const origin = w.from ? { address: w.from } : here ? { location: { latLng: { latitude: here.lat, longitude: here.lng } } } : undefined;
  if (!origin) return { status: "nofrom" }; // no place before: from where the phone is, as the link does (TR-21)
  const now = (o.now ?? (() => new Date()))().getTime(), at = w.start ? zoned(w.date, w.start, t.timezone) : 0;
  const ask = (when: { arrivalTime: string } | { departureTime: string }) => routes(o, { origin, destination: { address: w.to }, travelMode: "TRANSIT", ...when, languageCode: "sv-SE" });
  const first = await ask(at > now + 60_000 ? { arrivalTime: new Date(at).toISOString() } : { departureTime: new Date(now + 60_000).toISOString() });
  if (first.status !== "none" || !w.start || at <= now + FAR_MS) return first;
  const example = nearestWeekday(w.date, now, t.timezone), again = await ask({ arrivalTime: new Date(zoned(example, w.start, t.timezone)).toISOString() });
  return again.status === "ok" ? { ...again, example } : { status: "none", far: true };
}

async function routes(o: TrafficOpts, body: Record<string, unknown>): Promise<Transit> {
  try {
    const res = await (o.fetch ?? fetch)("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": o.routesKey!, "X-Goog-FieldMask": MASK },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(`Routes transit ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`); return { status: "error" }; } // shows in the Worker's logs
    const steps = transitSteps(await res.json());
    return steps ? { status: "ok", steps } : { status: "none" };
  } catch (e) {
    console.error("Routes transit failed:", e instanceof Error ? e.message : e);
    return { status: "error" };
  }
}
