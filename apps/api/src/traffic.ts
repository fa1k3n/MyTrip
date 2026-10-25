// Traffic check for a day's driving route (TR-09..TR-17). The routing key stays on the server (SP-01, SP-02).
import { routeOf, type Trip } from "@trip/schema";

export type Traffic =
  | { status: "off" } | { status: "none" } | { status: "error" }
  | { status: "ok" | "warn"; delayMin: number; jam: boolean; durationMin: number };
type RouteResult = { duration: string; staticDuration: string; speedReadingIntervals?: { speed?: string }[]; travelAdvisory?: unknown };

/** UTC instant of a wall-clock time in a time zone. */
function zoned(date: string, time: string, timeZone: string) {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const offset = (at: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(at).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

/** The planned departure, or now plus one minute when it has passed (TR-10). */
export function departureIso(date: string, time: string, timeZone: string, now: Date) {
  return new Date(Math.max(zoned(date, time, timeZone), now.getTime() + 60_000)).toISOString();
}

/** Warn on a delay of at least the threshold or a reported jam; advisories such as tolls never warn (TR-11..TR-14). */
export function verdict(r: RouteResult, thresholdMin: number): Traffic {
  const dur = parseInt(r.duration, 10), st = parseInt(r.staticDuration, 10);
  const delayMin = Math.round((dur - st) / 60), jam = (r.speedReadingIntervals ?? []).some((i) => i.speed === "TRAFFIC_JAM");
  return { status: delayMin >= thresholdMin || jam ? "warn" : "ok", delayMin, jam, durationMin: Math.round(dur / 60) };
}

export type TrafficOpts = { routesKey?: string; trafficThresholdMin?: number; fetch?: typeof fetch; now?: () => Date };

export async function checkTraffic(t: Trip, day: Trip["days"][number], o: TrafficOpts): Promise<Traffic> {
  const route = routeOf(day);
  if (!route) return { status: "none" };
  if (!o.routesKey) return { status: "off" }; // TR-15
  const car = day.legs.find((l) => l.vehicle === "car")!;
  const body = {
    origin: { address: route.origin }, destination: { address: route.destination },
    ...(route.waypoints.length ? { intermediates: route.waypoints.map((address) => ({ address })) } : {}),
    travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE_OPTIMAL", extraComputations: ["TRAFFIC_ON_POLYLINE"],
    departureTime: departureIso(day.date, car.departure ?? day.start, t.timezone, (o.now ?? (() => new Date()))()), languageCode: "sv-SE",
  };
  try {
    const res = await (o.fetch ?? fetch)("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": o.routesKey, "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.travelAdvisory.speedReadingIntervals" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { status: "error" };
    const r = (await res.json()).routes?.[0];
    if (!r?.duration || !r?.staticDuration) return { status: "error" };
    return verdict({ duration: r.duration, staticDuration: r.staticDuration, speedReadingIntervals: r.travelAdvisory?.speedReadingIntervals }, o.trafficThresholdMin ?? 10);
  } catch {
    return { status: "error" }; // TR-16
  }
}
