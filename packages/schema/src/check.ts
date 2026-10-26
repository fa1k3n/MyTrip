import type { Trip } from "./schema.ts";

/** Plan checks that the schema cannot express. Returns one message per problem. */
export function checkTrip(t: Trip): string[] {
  const p: string[] = [];
  const places = new Set(t.places.map((x) => x.id));
  const ids = new Set<string>();
  for (const x of [...t.days, ...t.places, ...t.bookings, ...t.tasks, ...t.travelers, ...(t.dreams ?? []), ...(t.budget ?? []), ...(t.expenses ?? []), ...(t.payments ?? []), ...(t.info ?? []), ...t.days.flatMap((d) => d.activities)]) {
    if (ids.has(x.id)) p.push(`Duplicate id: ${x.id}`);
    ids.add(x.id);
  }
  for (const d of t.days)
    for (const a of d.activities)
      for (const pid of a.placeIds) if (!places.has(pid)) p.push(`Activity ${a.id} refers to unknown place ${pid}`); // DM-09
  for (const b of t.bookings) if (b.placeId && !places.has(b.placeId)) p.push(`Booking ${b.id} refers to unknown place ${b.placeId}`);
  for (const b of t.bookings) { // BK-08
    if (!b.activityId) continue;
    const day = t.days.find((d) => d.activities.some((a) => a.id === b.activityId));
    if (!day) p.push(`Booking ${b.id} refers to unknown activity ${b.activityId}`);
    else if (day.date !== b.from) p.push(`Booking ${b.id} is linked to an activity on another date`);
  }
  for (const k of t.tasks) if (k.placeId && !places.has(k.placeId)) p.push(`Task ${k.id} refers to unknown place ${k.placeId}`);
  for (const x of t.info ?? []) if (x.placeId && !places.has(x.placeId)) p.push(`Info ${x.id} refers to unknown place ${x.placeId}`);
  for (const s of t.stops) if (!t.days.some((d) => d.id === s.dayId)) p.push(`Stop ${s.label} refers to unknown day ${s.dayId}`);
  const people = new Set(t.travelers.map((x) => x.id));
  const who = (owner: string, ids: string[]) => { for (const id of ids) if (!people.has(id)) p.push(`${owner} refers to unknown traveler ${id}`); }; // MI-01
  for (const e of t.expenses ?? []) who(`Expense ${e.id}`, [e.paidBy, ...e.sharedBy, ...(e.addedBy ? [e.addedBy] : [])]); // UP-13
  for (const x of t.payments ?? []) who(`Payment ${x.id}`, [x.from, x.to]);
  for (const a of t.days.flatMap((d) => d.activities)) who(`Activity ${a.id}`, a.hiddenFrom ?? []); // AU-18
  const dates = t.days.map((d) => d.date).sort();
  for (const b of t.bookings)
    if (b.status !== "cancelled" && dates.length && (b.from < dates[0] || b.to > dates[dates.length - 1]))
      p.push(`Booking ${b.id} is outside the days of the trip`); // DQ-04
  return p;
}
