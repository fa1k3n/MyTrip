// Pinned activities stay where they are (ED-24, ED-25): a proposal from an LLM client or the AI may not disturb them (MC-20).
import type { Trip } from "./schema.ts";

type Activity = Trip["days"][number]["activities"][number];
const where = (t: Trip) => new Map(t.days.flatMap((d) => d.activities.map((a) => [a.id, { a, day: d.id }] as const)));
const fixed = (a: Activity) => [a.start, a.end, a.durationMin, a.estimated];

/** The titles of the pinned activities that `next` removes, moves to another day, retimes or unpins. */
export function pinBreaks(t: Trip, next: Trip): string[] {
  const now = where(next);
  return [...where(t).values()].filter(({ a, day }) => {
    if (!a.pinned) return false;
    const b = now.get(a.id);
    return !b || b.day !== day || !b.a.pinned || JSON.stringify(fixed(a)) !== JSON.stringify(fixed(b.a));
  }).map(({ a }) => a.text);
}
