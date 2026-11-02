// Public transport to an activity, from Google Routes (TR-23). The routing key stays on the server (SP-01, SP-02), as for traffic (TR-15).
import { wayEnds, type Trip } from "@trip/schema";
import { zoned, type TrafficOpts } from "./traffic.ts";

export type Step =
  | { kind: "walk"; min: number }
  | { kind: "ride"; line: string; vehicle: string; headsign?: string; from: string; to: string; dep?: string; arr?: string; stops?: number };
export type Transit = { status: "off" | "none" | "error" } | { status: "ok"; steps: Step[] };

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

/** The first route's steps: walks in a row as one, with whole minutes; each ride with its line, kind, direction, stops and local times. Null without a route. */
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
  return out.some((s) => s.kind === "ride") ? out : null;
}

const MASK = "routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails";
/** Asks Routes for public transport to the activity, arriving by its start, or leaving now when that has passed (TR-23). */
export async function checkTransit(t: Trip, dayId: string, activityId: string, o: TrafficOpts): Promise<Transit> {
  const w = wayEnds(t, dayId, activityId);
  if (!w || (w.vehicle !== "transit" && w.vehicle !== "train") || !w.from) return { status: "none" };
  if (!o.routesKey) return { status: "off" };
  const now = (o.now ?? (() => new Date()))().getTime(), at = w.start ? zoned(w.date, w.start, t.timezone) : 0;
  const when = at > now + 60_000 ? { arrivalTime: new Date(at).toISOString() } : { departureTime: new Date(now + 60_000).toISOString() };
  try {
    const res = await (o.fetch ?? fetch)("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": o.routesKey, "X-Goog-FieldMask": MASK },
      body: JSON.stringify({ origin: { address: w.from }, destination: { address: w.to }, travelMode: "TRANSIT", ...when, languageCode: "sv-SE" }),
    });
    if (!res.ok) return { status: "error" };
    const steps = transitSteps(await res.json());
    return steps ? { status: "ok", steps } : { status: "none" };
  } catch {
    return { status: "error" };
  }
}
