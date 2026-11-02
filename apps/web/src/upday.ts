// The day's timeline in Uppleva: lengths, the "Nu" line and clashes (UP-16, UP-28, UP-29). Pure, so it runs under node --test.
import { activityEnd, toMin } from "./time.ts";
import { sv } from "./sv.ts";

type Timed = { id: string; start?: string; end?: string; durationMin?: number; estimated: boolean };

/** "ca 1 tim 30 min" from an estimated duration; a fixed end wins and has no "ca" (UP-16, DM-13). Uppleva leaves "ca" out (UP-36). */
export function durationText(a: Timed, about = true) {
  const fixed = !!(a.start && a.end), min = fixed ? toMin(a.end!) - toMin(a.start!) : a.durationMin;
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60), m = min % 60;
  const text = [h && sv.up.hours(h), m && sv.up.minutes(m)].filter(Boolean).join(" ");
  return fixed || !about ? text : `${sv.up.about} ${text}`;
}

/** The index the "Nu" line goes before: the first activity that starts after `now`, else the end; -1 without `now` (not today) (UP-29). */
export function nowAt(list: { start?: string }[], now: string | undefined) {
  if (!now) return -1;
  const i = list.findIndex((a) => a.start && toMin(a.start) > toMin(now));
  return i < 0 ? list.length : i;
}

/** Whether an activity has ended by `now`: at its end, else when the next one starts; never without `now` (another day) (UP-50). */
export function hasEnded<A extends Timed>(list: A[], i: number, now: string | undefined) {
  if (!now) return false;
  const end = activityEnd(list[i]!) ?? list.slice(i + 1).find((x) => x.start)?.start;
  return !!end && toMin(end) <= toMin(now);
}

/** What the floating add button in Uppleva adds: an activity for a role that may change the plan, an expense for one that may add
 * expenses; with both it offers a choice (UP-41, UP-51). */
export const addChoices = (expense: boolean, plan: boolean) => [...(plan ? ["activity" as const] : []), ...(expense ? ["expense" as const] : [])];

/** Activities that end after the next timed activity starts, fixed or estimated (UP-28). */
export function clashes<A extends Timed>(list: A[]) {
  const out = new Map<string, { end: string; with: A }>();
  list.forEach((a, i) => {
    const end = activityEnd(a);
    if (!a.start || !end) return;
    const next = list.slice(i + 1).find((x) => x.start);
    if (next && toMin(end) > toMin(next.start!)) out.set(a.id, { end, with: next });
  });
  return out;
}

const hh = (t: string) => t.replace(":", ".");
/** An activity's time in Uppleva, without "ca" (UP-36). */
export const upTime = (a: { start?: string; estimated: boolean }) => (a.start ? hh(a.start) : "");
/** The day's time in Uppleva's heading, without "ca" (UP-36). */
export const upDayTime = <D extends { start: string; end: string }>(d: D) => `${hh(d.start)}–${hh(d.end)}`;

