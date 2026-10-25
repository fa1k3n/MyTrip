// Builds the changes (ops) for editing in Nåla. Pure, so it runs under node --test (ED-01..ED-08).
import type { Op, Trip } from "@trip/schema";
import { dateBadge } from "./format.ts";
import { parseAmount } from "./money.ts";
import { sv } from "./sv.ts";

export type Result = { ok: true; ops: Op[] } | { ok: false; error: string };
type Day = Trip["days"][number];
type Activity = Day["activities"][number];

const fail = (error: string): Result => ({ ok: false, error });
const ok = (ops: Op[]): Result => ({ ok: true, ops });
const isDate = (s: string) => /^\d{4}-\d\d-\d\d$/.test(s);
const isTime = (s: string) => /^\d\d:\d\d$/.test(s);
/** Leaves out empty optional fields so stored data stays clean. */
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Readable id from a name, unique among `taken` (ED-08). */
export function uniqueId(name: string, taken: Iterable<string>) {
  const used = new Set(taken), base = slug(name) || "x";
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Every id in the trip; ids must be unique across all lists (DM-09). */
const allIds = (t: Trip) => [
  ...t.days, ...t.places, ...t.bookings, ...t.tasks, ...t.travelers, ...t.dreams, ...t.budget, ...t.expenses, ...t.payments,
  ...t.days.flatMap((d) => d.activities),
].map((x) => x.id);

export const splitIcons = (s: string) =>
  [...new Intl.Segmenter("sv", { granularity: "grapheme" }).segment(s.replace(/\s+/g, ""))].map((x) => x.segment);

export function saveTrip(t: Trip, input: { title: string; purpose: string }): Result {
  const title = input.title.trim();
  if (!title) return fail(sv.errors.title);
  return ok([{ op: "set", path: "title", value: title }, { op: "set", path: "purpose", value: input.purpose.trim() }]);
}

export type DayInput = {
  date: string; title: string; summary: string; icons: string; start: string; end: string;
  startEstimated: boolean; endEstimated: boolean; location: string;
  weather?: { lat: number; lon: number } | null; // undefined: keep, null: remove
};

export function saveDay(t: Trip, input: DayInput, id?: string): Result {
  const i = id ? t.days.findIndex((d) => d.id === id) : -1;
  const old: Day | undefined = t.days[i];
  const icons = splitIcons(input.icons);
  if (!isDate(input.date)) return fail(sv.errors.date);
  if (t.days.some((d) => d.date === input.date && d.id !== id)) return fail(sv.errors.dateTaken);
  if (!input.title.trim()) return fail(sv.errors.title);
  if (!input.summary.trim()) return fail(sv.errors.summary);
  if (icons.length < 1 || icons.length > 2) return fail(sv.errors.icons);
  if (!isTime(input.start) || !isTime(input.end)) return fail(sv.errors.time);
  if (input.end < input.start) return fail(sv.errors.endBeforeStart);
  const location = input.location.trim() || undefined;
  const day: Day = clean({
    ...(old ?? { activities: [], legs: [] }),
    id: old?.id ?? uniqueId(`day-${input.date}`, allIds(t)),
    date: input.date, title: input.title.trim(), summary: input.summary.trim(), icons,
    start: input.start, end: input.end, estimated: false,
    startEstimated: input.startEstimated, endEstimated: input.endEstimated, location,
    weather: input.weather === undefined ? old?.weather : input.weather ?? undefined,
  });
  const badge = dateBadge(day.date);
  const stop = { label: location ?? day.title, sub: `${badge.d} ${badge.w}`, dayId: day.id }; // ED-03
  const j = t.stops.findIndex((s) => s.dayId === day.id);
  return ok([
    old ? { op: "set", path: `days/${i}`, value: day } : { op: "add", path: "days/-", value: day },
    j >= 0 ? { op: "set", path: `stops/${j}`, value: stop } : { op: "add", path: "stops/-", value: stop },
  ]);
}

/** Removes in descending index order so earlier removals do not shift later ones. */
const removeAt = (list: string, indexes: number[]): Op[] =>
  indexes.filter((n) => n >= 0).sort((a, b) => b - a).map((n) => ({ op: "remove", path: `${list}/${n}` }));

export const removeDay = (t: Trip, id: string): Op[] => [
  ...removeAt("stops", t.stops.flatMap((s, n) => (s.dayId === id ? [n] : []))),
  ...removeAt("days", [t.days.findIndex((d) => d.id === id)]),
];

export type ActivityInput = {
  start: string; estimated: boolean; text: string;
  place: { kind: "none" } | { kind: "existing"; id: string } | { kind: "new"; name: string; address: string };
};

/** Timed activities in time order, untimed last (ED-05). */
const byTime = (list: Activity[]) =>
  [...list].sort((a, b) => (a.start ? (b.start ? a.start.localeCompare(b.start) : -1) : b.start ? 1 : 0));

export function saveActivity(t: Trip, dayId: string, input: ActivityInput, id?: string): Result {
  const di = t.days.findIndex((d) => d.id === dayId);
  if (di < 0) return fail(sv.errors.day);
  const text = input.text.trim();
  if (!text) return fail(sv.errors.text);
  if (input.start && !isTime(input.start)) return fail(sv.errors.activityTime);
  const ops: Op[] = [];
  const taken = allIds(t);
  let placeIds: string[] = [];
  if (input.place.kind === "existing") placeIds = [input.place.id];
  if (input.place.kind === "new") {
    const name = input.place.name.trim(), address = input.place.address.trim();
    if (!name || !address) return fail(sv.errors.place);
    const pid = uniqueId(name, taken);
    taken.push(pid);
    ops.push({ op: "add", path: "places/-", value: { id: pid, name, address } });
    placeIds = [pid];
  }
  const list = t.days[di].activities;
  const old = list.find((a) => a.id === id);
  const activity: Activity = clean({
    ...old, id: old?.id ?? uniqueId(text, taken), text, placeIds,
    start: input.start || undefined, estimated: !!input.start && input.estimated,
  });
  const next = old ? list.map((a) => (a.id === old.id ? activity : a)) : [...list, activity];
  ops.push({ op: "set", path: `days/${di}/activities`, value: byTime(next) });
  return ok(ops);
}

export function removeActivity(t: Trip, dayId: string, id: string): Op[] {
  const di = t.days.findIndex((d) => d.id === dayId);
  return di < 0 ? [] : [{ op: "set", path: `days/${di}/activities`, value: t.days[di].activities.filter((a) => a.id !== id) }];
}

export type BookingInput = { name: string; from: string; to: string; status: "paid" | "ready" | "cancelled"; reference: string; placeId: string };

export function saveBooking(t: Trip, input: BookingInput, id?: string): Result {
  const name = input.name.trim();
  if (!name) return fail(sv.errors.name);
  if (!isDate(input.from) || !isDate(input.to)) return fail(sv.errors.dates);
  if (input.to < input.from) return fail(sv.errors.toBeforeFrom);
  const i = id ? t.bookings.findIndex((b) => b.id === id) : -1;
  const old = t.bookings[i];
  const booking = clean({
    ...old, id: old?.id ?? uniqueId(name, allIds(t)), name, from: input.from, to: input.to, status: input.status,
    reference: input.reference.trim() || undefined, placeId: input.placeId || undefined,
  });
  return ok([old ? { op: "set", path: `bookings/${i}`, value: booking } : { op: "add", path: "bookings/-", value: booking }]);
}

export const removeBooking = (t: Trip, id: string): Op[] => removeAt("bookings", [t.bookings.findIndex((b) => b.id === id)]);

export type BudgetInput = { category: string; amount: string; paid: boolean; owner: string };

export function saveBudgetItem(t: Trip, input: BudgetInput, id?: string): Result {
  const category = input.category.trim();
  if (!category) return fail(sv.errors.category);
  const amount = parseAmount(input.amount);
  if (Number.isNaN(amount)) return fail(sv.badAmount);
  const i = id ? t.budget.findIndex((b) => b.id === id) : -1;
  const old = t.budget[i];
  const item = clean({ id: old?.id ?? uniqueId(category, allIds(t)), category, amount, paid: input.paid, owner: input.owner.trim() || undefined });
  return ok([old ? { op: "set", path: `budget/${i}`, value: item } : { op: "add", path: "budget/-", value: item }]);
}

export const removeBudgetItem = (t: Trip, id: string): Op[] => removeAt("budget", [t.budget.findIndex((b) => b.id === id)]);
