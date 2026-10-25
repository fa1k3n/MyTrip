// A day's activities as a schedule: gaps and overlaps (ED-17) and moving activities by drag and drop (ED-16). Pure, so it runs under node --test.
import type { Op, Trip } from "@trip/schema";
import { byTime, type Result } from "./edit.ts";
import { activityEnd, fromMin, toMin } from "./time.ts";
import { sv } from "./sv.ts";

export { activityEnd };
type Activity = Trip["days"][number]["activities"][number];
type Timed = { start?: string; end?: string; durationMin?: number };

/** A gap shorter than this is a buffer, not a hole in the plan. */
export const GAP_MIN = 30;
const DEFAULT_MIN = 60; // used for placing an activity that has no duration yet

/** What the activity form still needs before it can be saved (ED-15), or null. */
export function activityMissing(input: { start: string; durationMin?: number; category: string }) {
  if (!input.start) return sv.errors.activityStart;
  if (!input.durationMin) return sv.errors.duration;
  if (!input.category) return sv.errors.category;
  return null;
}

export type Row<A> = { kind: "act"; a: A } | { kind: "gap" | "clash"; min: number };

/** The activities with a gap or clash row between them where the plan has a hole or an overlap (ED-17). */
export function scheduleRows<A extends Timed>(list: A[]): Row<A>[] {
  const rows: Row<A>[] = [];
  let latest: number | undefined; // the latest end so far; undefined when it is not known
  for (const a of list) {
    if (a.start && latest !== undefined) {
      const d = toMin(a.start) - latest;
      if (d < 0) rows.push({ kind: "clash", min: -d });
      else if (d >= GAP_MIN) rows.push({ kind: "gap", min: d });
    }
    rows.push({ kind: "act", a });
    const end = activityEnd(a);
    if (a.start) latest = end ? Math.max(latest ?? 0, toMin(end)) : undefined;
  }
  return rows;
}

const length = (a: Activity) => a.durationMin ?? (a.start && a.end ? toMin(a.end) - toMin(a.start) : DEFAULT_MIN);

/**
 * Moves an activity to `index` in a day's list (counted without the activity itself).
 * It starts when the activity before it ends, or ends when the one after it starts if it lands first.
 * Its duration is kept and its time becomes an estimate; other activities keep their times.
 */
export function moveActivity(t: Trip, fromDay: string, id: string, toDay: string, index: number): Result {
  const fi = t.days.findIndex((d) => d.id === fromDay), ti = t.days.findIndex((d) => d.id === toDay);
  const a = t.days[fi]?.activities.find((x) => x.id === id);
  if (!a || ti < 0) return { ok: false, error: sv.errors.move };
  const target = t.days[ti].activities.filter((x) => x.id !== id);
  const at = Math.max(0, Math.min(index, target.length));
  const before = target.slice(0, at).reverse().find((x) => x.start), after = target.slice(at).find((x) => x.start);
  const len = length(a);
  const start = before ? (activityEnd(before) ?? fromMin(toMin(before.start!) + length(before)))
    : after ? fromMin(toMin(after.start!) - len)
    : a.start ?? t.days[ti].start;
  const next: Activity = { ...a, start, estimated: true, ...(a.end ? { end: fromMin(toMin(start) + len) } : {}) };
  target.splice(at, 0, next);
  const ops: Op[] = [{ op: "set", path: `days/${ti}/activities`, value: byTime(target) }];
  if (fi !== ti) ops.unshift({ op: "set", path: `days/${fi}/activities`, value: t.days[fi].activities.filter((x) => x.id !== id) });
  return { ok: true, ops };
}
