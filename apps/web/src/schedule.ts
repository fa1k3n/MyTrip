// A day's activities as a schedule: gaps and overlaps (ED-17) and moving activities by drag and drop (ED-16). Pure, so it runs under node --test.
import type { Op, Trip } from "@trip/schema";
import { allIds, byTime, uniqueId, type Result } from "./edit.ts";
import { activityEnd, fromMin, toMin } from "./time.ts";
import { sv } from "./sv.ts";
import { TIME_POINT } from "./categories.ts";

export { activityEnd };
type Activity = Trip["days"][number]["activities"][number];
type Timed = { start?: string; end?: string; durationMin?: number; travel?: { durationMin: number } };

/** A gap shorter than this is a buffer, not a hole in the plan. */
export const GAP_MIN = 30;
const DEFAULT_MIN = 60; // used for placing an activity that has no duration yet

/** What the activity form still needs before it can be saved (ED-15), or null. */
/** A Klockslag needs no duration (ED-20). */
export function activityMissing(input: { start: string; durationMin?: number; category: string }) {
  if (!input.start) return sv.errors.activityStart;
  if (!input.durationMin && input.category !== TIME_POINT) return sv.errors.duration;
  if (!input.category) return sv.errors.category;
  return null;
}

export type Row<A> = { kind: "act"; a: A } | { kind: "gap" | "clash"; min: number };

/** The activities with a gap or clash row between them where the plan has a hole or an overlap (ED-17); the way to an activity counts (TR-20). */
export function scheduleRows<A extends Timed>(list: A[]): Row<A>[] {
  const rows: Row<A>[] = [];
  let latest: number | undefined; // the latest end so far; undefined when it is not known
  for (const a of list) {
    if (a.start && latest !== undefined) {
      const d = toMin(a.start) - latest - (a.travel?.durationMin ?? 0);
      if (d < 0) rows.push({ kind: "clash", min: -d });
      else if (d >= GAP_MIN) rows.push({ kind: "gap", min: d });
    }
    rows.push({ kind: "act", a });
    const end = activityEnd(a);
    if (a.start) latest = end ? Math.max(latest ?? 0, toMin(end)) : undefined;
  }
  return rows;
}

const length = (a: Timed) => a.durationMin ?? (a.start && a.end ? toMin(a.end) - toMin(a.start) : DEFAULT_MIN);

/** When an activity of length `len` starts at `at` in `list`: after the one before it, else ending when the next one starts (ED-16). */
function startAt(list: Activity[], at: number, len: number, fallback: string) {
  const before = list.slice(0, at).reverse().find((x) => x.start), after = list.slice(at).find((x) => x.start);
  return before ? (activityEnd(before) ?? fromMin(toMin(before.start!) + length(before)))
    : after ? fromMin(toMin(after.start!) - len)
    : fallback;
}

/**
 * Moves an activity to `index` in a day's list (counted without the activity itself).
 * It starts when the activity before it ends, or ends when the one after it starts if it lands first.
 * Its duration is kept and its time becomes an estimate; other activities keep their times.
 */
export function moveActivity(t: Trip, fromDay: string, id: string, toDay: string, index: number): Result {
  const fi = t.days.findIndex((d) => d.id === fromDay), ti = t.days.findIndex((d) => d.id === toDay);
  const a = t.days[fi]?.activities.find((x) => x.id === id);
  if (!a || ti < 0) return { ok: false, error: sv.errors.move };
  if (a.pinned) return { ok: false, error: sv.errors.pinned }; // ED-25
  const target = t.days[ti].activities.filter((x) => x.id !== id);
  const at = Math.max(0, Math.min(index, target.length));
  const len = length(a);
  const start = startAt(target, at, len, a.start ?? t.days[ti].start);
  const next: Activity = { ...a, start, estimated: true, ...(a.end ? { end: fromMin(toMin(start) + len) } : {}) };
  target.splice(at, 0, next);
  const ops: Op[] = [{ op: "set", path: `days/${ti}/activities`, value: byTime(target) }];
  if (fi !== ti) ops.unshift({ op: "set", path: `days/${fi}/activities`, value: t.days[fi].activities.filter((x) => x.id !== id) });
  return { ok: true, ops };
}

/**
 * Plans a wish on a day at `index` (last when left out): a new activity with the wish's title and category, linked to it,
 * without place or duration, placed as a move places one, with an estimated time (DB-17). A wish can be planned again.
 */
export function planWish(t: Trip, dreamId: string, dayId: string, index?: number): Result {
  const w = t.dreams.find((x) => x.id === dreamId), di = t.days.findIndex((d) => d.id === dayId);
  if (!w || w.hidden || di < 0) return { ok: false, error: sv.errors.planWish };
  const list = [...t.days[di].activities], at = Math.max(0, Math.min(index ?? list.length, list.length));
  const next: Activity = { id: uniqueId(w.title, allIds(t)), text: w.title, placeIds: [], category: w.category, dreamId: w.id, estimated: true,
    start: startAt(list, at, DEFAULT_MIN, t.days[di].start) };
  list.splice(at, 0, next);
  return { ok: true, ops: [{ op: "set", path: `days/${di}/activities`, value: byTime(list) }] };
}

export { WISH_DRAG } from "./drag.ts";
