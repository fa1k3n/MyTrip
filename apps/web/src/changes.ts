// What a change alters in a trip, compared before and after: for the proposal view (MC-16, MC-17) and Ångra (ED-22).
// Pure and free of the schema validator, so the main page stays small (PF-01).
import type { Trip } from "@trip/schema";
import { activityTime, dayLabel } from "./format.ts";
import { sv } from "./sv.ts";

type Day = Trip["days"][number];
type Activity = Day["activities"][number];
export type Change = { kind: "add" | "change" | "remove"; text: string };
export type Mark = "add" | "change";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The lists compared by id, each with the name shown for an item (MC-16). Days and their activities are compared apart. */
const LISTS = {
  places: (x: { name: string }) => x.name,
  bookings: (x: { name: string }) => x.name,
  budget: (x: { note?: string; category: string }) => x.note ?? x.category,
  tasks: (x: { text: string }) => x.text,
  info: (x: { title: string }) => x.title,
  travelers: (x: { name: string }) => x.name,
  dreams: (x: { title: string }) => x.title,
  expenses: (x: { text: string }) => x.text,
  payments: (x: { amount: number }) => String(x.amount),
} as const;
type ListKey = keyof typeof LISTS;
const SKIP = new Set(["revision", "days", "stops", ...Object.keys(LISTS)]);

function byId<X extends { id: string }>(before: X[], after: X[], name: (x: X) => string, label: string): Change[] {
  const old = new Map(before.map((x) => [x.id, x])), now = new Set(after.map((x) => x.id)), out: Change[] = [];
  for (const x of after) {
    const was = old.get(x.id);
    if (!was) out.push({ kind: "add", text: `${label}: ${name(x)}` });
    else if (!same(was, x)) out.push({ kind: "change", text: `${label}: ${name(x)}` });
  }
  for (const x of before) if (!now.has(x.id)) out.push({ kind: "remove", text: `${label}: ${name(x)}` });
  return out;
}

const where = (a: Activity, d: Day) => [a.text, [dayLabel(d.date), activityTime(a)].filter(Boolean).join(" ")].join(" · ");
const activities = (t: Trip) => new Map(t.days.flatMap((d) => d.activities.map((a) => [a.id, { a, d }] as const)));

/** What a proposal changes, from the trip before and after it: activities, days, the other lists, then the rest (MC-16). */
export function tripChanges(t: Trip, next: Trip): Change[] {
  const out: Change[] = [], label = sv.proposal.kinds;
  const was = activities(t), now = activities(next);
  for (const [id, { a, d }] of now) {
    const old = was.get(id);
    if (!old) out.push({ kind: "add", text: `${label.activity}: ${where(a, d)}` });
    else if (!same(old.a, a) || old.d.id !== d.id) out.push({ kind: "change", text: `${label.activity}: ${where(a, d)}` });
  }
  for (const [id, { a, d }] of was) if (!now.has(id)) out.push({ kind: "remove", text: `${label.activity}: ${where(a, d)}` });
  const bare = (d: Day) => ({ ...d, activities: [] });
  out.push(...byId(t.days.map(bare), next.days.map(bare), (d) => `${dayLabel(d.date)} · ${d.title}`, label.days));
  for (const k of Object.keys(LISTS) as ListKey[])
    out.push(...byId((t[k] ?? []) as { id: string }[], (next[k] ?? []) as { id: string }[], LISTS[k] as unknown as (x: { id: string }) => string, label[k]));
  if (!same(t.stops, next.stops)) out.push({ kind: "change", text: `${label.stops}: ${next.stops.map((s) => s.label).join(", ")}` }); // AI-10
  const rest = [...new Set([...Object.keys(t), ...Object.keys(next)])].filter((k) => !SKIP.has(k) && !same(t[k as keyof Trip], next[k as keyof Trip]));
  if (rest.length) out.push({ kind: "change", text: `${sv.proposal.other}: ${rest.join(", ")}` });
  return out;
}

/** The days a preview opens, with the mark of each new or changed activity and the activities it removes (MC-17). */
export function previewMarks(t: Trip, next: Trip) {
  const was = activities(t), now = activities(next), out = new Map<string, { marks: Map<string, Mark>; removed: Activity[] }>();
  const of = (dayId: string) => out.get(dayId) ?? out.set(dayId, { marks: new Map(), removed: [] }).get(dayId)!;
  for (const [id, { a, d }] of now) {
    const old = was.get(id);
    if (!old) of(d.id).marks.set(id, "add");
    else if (!same(old.a, a) || old.d.id !== d.id) of(d.id).marks.set(id, "change");
  }
  for (const [id, { a, d }] of was) if (!now.has(id)) of(d.id).removed.push(a);
  return out;
}
