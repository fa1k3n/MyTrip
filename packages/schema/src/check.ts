import type { Trip } from "./schema.ts";

/** Plan checks that the schema cannot express. Returns one message per problem. */
export function checkTrip(t: Trip): string[] {
  const p: string[] = [];
  const places = new Set(t.places.map((x) => x.id));
  const ids = new Set<string>();
  for (const x of [...t.days, ...t.places, ...t.bookings, ...t.tasks, ...t.travelers, ...(t.dreams ?? []), ...(t.budget ?? []), ...t.days.flatMap((d) => d.activities)]) {
    if (ids.has(x.id)) p.push(`Duplicate id: ${x.id}`);
    ids.add(x.id);
  }
  for (const d of t.days)
    for (const a of d.activities)
      for (const pid of a.placeIds) if (!places.has(pid)) p.push(`Activity ${a.id} refers to unknown place ${pid}`); // DM-09
  for (const b of t.bookings) if (b.placeId && !places.has(b.placeId)) p.push(`Booking ${b.id} refers to unknown place ${b.placeId}`);
  for (const k of t.tasks) if (k.placeId && !places.has(k.placeId)) p.push(`Task ${k.id} refers to unknown place ${k.placeId}`);
  for (const s of t.stops) if (!t.days.some((d) => d.id === s.dayId)) p.push(`Stop ${s.label} refers to unknown day ${s.dayId}`);
  const dates = t.days.map((d) => d.date).sort();
  for (const b of t.bookings)
    if (b.status !== "cancelled" && dates.length && (b.from < dates[0] || b.to > dates[dates.length - 1]))
      p.push(`Booking ${b.id} is outside the days of the trip`); // DQ-04
  return p;
}
