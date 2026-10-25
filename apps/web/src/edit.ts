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
  ...t.days, ...t.places, ...t.bookings, ...t.tasks, ...t.travelers, ...t.dreams, ...t.budget, ...t.expenses, ...t.payments, ...t.info,
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

// --- The trip's dates (ED-14): days are added and removed by changing the first and last date in the trip's settings

const MAX_DAYS = 60;

/** The first and last date of the trip, or null when it has no days. */
export function tripRange(t: Trip) {
  const ds = t.days.map((d) => d.date).sort();
  return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
}

/** Every date from `from` to `to`; computed in UTC so summer time does not skip or repeat a day. */
function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); out.length <= MAX_DAYS; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > to) break;
    out.push(iso);
  }
  return out;
}

/** Days that a new date range would remove; the form asks before removing them (ED-09). */
export const daysOutside = (t: Trip, from: string, to: string) => t.days.filter((d) => d.date < from || d.date > to);

export function setTripDates(t: Trip, input: { from: string; to: string }): Result {
  if (!isDate(input.from) || !isDate(input.to)) return fail(sv.errors.dates);
  if (input.to < input.from) return fail(sv.errors.toBeforeFrom);
  const dates = datesBetween(input.from, input.to);
  if (dates.length > MAX_DAYS) return fail(sv.errors.tooLong);
  const taken = allIds(t), have = new Set(t.days.map((d) => d.date));
  const gone = new Set(daysOutside(t, input.from, input.to).map((d) => d.id));
  const ops: Op[] = [
    ...removeAt("stops", t.stops.flatMap((s, n) => (gone.has(s.dayId) ? [n] : []))),
    ...removeAt("days", t.days.flatMap((d, n) => (gone.has(d.id) ? [n] : []))),
  ];
  for (const date of dates.filter((x) => !have.has(x))) {
    const id = uniqueId(`day-${date}`, taken);
    taken.push(id);
    const badge = dateBadge(date);
    ops.push(
      { op: "add", path: "days/-", value: { id, date, title: sv.newDay, summary: sv.emptyDay, icons: ["📅"], start: "09:00", end: "18:00", estimated: true, legs: [], activities: [] } },
      { op: "add", path: "stops/-", value: { label: sv.newDay, sub: `${badge.d} ${badge.w}`, dayId: id } },
    );
  }
  return ok(ops);
}

export type ActivityInput = {
  start: string; estimated: boolean; text: string;
  place: { kind: "none" } | { kind: "existing"; id: string } | { kind: "new"; name: string; address: string };
  category?: string; // undefined: keep, "": none (ED-12)
  durationMin?: number; // undefined: keep (ED-15)
  note?: string; // undefined: keep, "": remove (ED-19)
};

/** Timed activities in time order, untimed last (ED-05). */
export const byTime = (list: Activity[]) =>
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
    category: input.category === undefined ? old?.category : input.category || undefined,
    durationMin: input.durationMin ?? old?.durationMin,
    note: input.note === undefined ? old?.note : input.note.trim() || undefined,
    end: input.durationMin === undefined ? old?.end : undefined, // the form sets a duration, which replaces a fixed end
  });
  const next = old ? list.map((a) => (a.id === old.id ? activity : a)) : [...list, activity];
  ops.push({ op: "set", path: `days/${di}/activities`, value: byTime(next) });
  return ok(ops);
}

export function removeActivity(t: Trip, dayId: string, id: string): Op[] {
  const di = t.days.findIndex((d) => d.id === dayId);
  return di < 0 ? [] : [{ op: "set", path: `days/${di}/activities`, value: t.days[di].activities.filter((a) => a.id !== id) }];
}

export type BookingInput = {
  name: string; from: string; to: string; status: "paid" | "ready" | "cancelled"; reference: string; placeId: string;
  note?: string; // undefined: keep, "": remove (BK-06)
};

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
    note: input.note === undefined ? old?.note : input.note.trim() || undefined,
  });
  return ok([old ? { op: "set", path: `bookings/${i}`, value: booking } : { op: "add", path: "bookings/-", value: booking }]);
}

export const removeBooking = (t: Trip, id: string): Op[] => removeAt("bookings", [t.bookings.findIndex((b) => b.id === id)]);

export type BudgetInput = {
  category: string; amount: string; paid: boolean; owner: string;
  estimate?: boolean; amountMax?: string; currency?: string; note?: string; // BG-03, BG-06, BG-07
};

export function saveBudgetItem(t: Trip, input: BudgetInput, id?: string): Result {
  const category = input.category.trim();
  if (!category) return fail(sv.errors.category);
  const estimate = !!input.estimate;
  const amount = input.amount.trim() ? parseAmount(input.amount) : undefined; // an estimate may be "not checked yet"
  if (amount === undefined ? !estimate : Number.isNaN(amount)) return fail(sv.badAmount);
  const amountMax = input.amountMax?.trim() ? parseAmount(input.amountMax) : undefined;
  if (amountMax !== undefined && (Number.isNaN(amountMax) || amount === undefined || amountMax < amount)) return fail(sv.errors.range);
  const i = id ? t.budget.findIndex((b) => b.id === id) : -1;
  const old = t.budget[i];
  const currency = input.currency && input.currency !== t.currency ? input.currency : undefined;
  const item = clean({
    id: old?.id ?? uniqueId(category, allIds(t)), category, amount, amountMax, paid: input.paid,
    estimate: estimate || undefined, currency, owner: input.owner.trim() || undefined, note: input.note?.trim() || undefined,
  });
  return ok([old ? { op: "set", path: `budget/${i}`, value: item } : { op: "add", path: "budget/-", value: item }]);
}

export const removeBudgetItem = (t: Trip, id: string): Op[] => removeAt("budget", [t.budget.findIndex((b) => b.id === id)]);

// --- Tasks (TK-02, TK-03, TK-09)

export function toggleTask(t: Trip, id: string): Op[] {
  const i = t.tasks.findIndex((k) => k.id === id);
  return i < 0 ? [] : [{ op: "set", path: `tasks/${i}/done`, value: !t.tasks[i].done }];
}

export type TaskInput = { text: string; due: string; placeId: string };

export function saveTask(t: Trip, input: TaskInput, id?: string): Result {
  const text = input.text.trim();
  if (!text) return fail(sv.errors.taskText);
  if (input.due && !isDate(input.due)) return fail(sv.errors.date);
  const i = id ? t.tasks.findIndex((k) => k.id === id) : -1;
  const old = t.tasks[i];
  const task = clean({ id: old?.id ?? uniqueId(text, allIds(t)), text, done: old?.done ?? false, due: input.due || undefined, placeId: input.placeId || undefined });
  return ok([old ? { op: "set", path: `tasks/${i}`, value: task } : { op: "add", path: "tasks/-", value: task }]);
}

export const removeTask = (t: Trip, id: string): Op[] => removeAt("tasks", [t.tasks.findIndex((k) => k.id === id)]);

// --- Places (PL-17)

export type PlaceInput = { name: string; address: string; phone: string; notes: string; website: string; bookingUrl: string; bookingLabel: string };

/** "niederegger.de" -> "https://niederegger.de"; null when it is not a web address. */
function webUrl(s: string): string | undefined | null {
  const v = s.trim();
  if (!v) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.includes(".") ? u.href.replace(/\/$/, v.endsWith("/") ? "/" : "") : null;
  } catch {
    return null;
  }
}

export function savePlace(t: Trip, input: PlaceInput, id?: string): Result {
  const name = input.name.trim(), address = input.address.trim();
  if (!name || !address) return fail(sv.errors.place);
  const website = webUrl(input.website), bookingUrl = webUrl(input.bookingUrl);
  if (website === null || bookingUrl === null) return fail(sv.errors.url);
  const i = id ? t.places.findIndex((p) => p.id === id) : -1;
  const old = t.places[i];
  const place = clean({
    id: old?.id ?? uniqueId(name, allIds(t)), name, address, phone: input.phone.trim() || undefined, notes: input.notes.trim() || undefined,
    website, bookingUrl, bookingLabel: bookingUrl ? input.bookingLabel.trim() || undefined : undefined,
  });
  return ok([old ? { op: "set", path: `places/${i}`, value: place } : { op: "add", path: "places/-", value: place }]);
}

/** Removes the place and every reference to it, so the plan stays valid (DM-09). */
export function removePlace(t: Trip, id: string): Op[] {
  const ops: Op[] = [];
  t.days.forEach((d, di) => {
    if (d.activities.some((a) => a.placeIds.includes(id)))
      ops.push({ op: "set", path: `days/${di}/activities`, value: d.activities.map((a) => ({ ...a, placeIds: a.placeIds.filter((p) => p !== id) })) });
  });
  for (const [list, items] of [["bookings", t.bookings], ["tasks", t.tasks], ["info", t.info]] as const)
    items.forEach((x, n) => { if (x.placeId === id) ops.push({ op: "remove", path: `${list}/${n}/placeId` }); });
  return [...ops, ...removeAt("places", [t.places.findIndex((p) => p.id === id)])];
}

// --- Practical information (PI-01..PI-05)

export type InfoInput = { title: string; text: string; placeId: string; unsuitable: string; verify: boolean };

export function saveInfo(t: Trip, input: InfoInput, id?: string): Result {
  const title = input.title.trim();
  if (!title) return fail(sv.errors.title);
  const i = id ? t.info.findIndex((x) => x.id === id) : -1;
  const old = t.info[i];
  const info = clean({
    id: old?.id ?? uniqueId(title, allIds(t)), title, text: input.text.trim(), placeId: input.placeId || undefined,
    unsuitable: input.unsuitable.trim() || undefined, verify: input.verify || undefined,
  });
  return ok([old ? { op: "set", path: `info/${i}`, value: info } : { op: "add", path: "info/-", value: info }]);
}

export const removeInfo = (t: Trip, id: string): Op[] => removeAt("info", [t.info.findIndex((x) => x.id === id)]);

// --- Packing lists (PK-07): "shared" or a traveler id

const packingPath = (t: Trip, list: string) => {
  if (list === "shared") return "packing";
  const i = t.travelers.findIndex((x) => x.id === list);
  return i < 0 ? null : `travelers/${i}/packing`;
};

export function addPacking(t: Trip, list: string, text: string): Result {
  const item = text.trim(), path = packingPath(t, list);
  if (!item) return fail(sv.errors.item);
  if (!path) return fail(sv.errors.name);
  return ok([{ op: "add", path: `${path}/-`, value: item }]);
}

/** The list's items and which of them are checked; checks are stored by item text beside the list (PK-05). */
function packingList(t: Trip, list: string) {
  if (list === "shared") return { items: t.packing, packed: t.packed, path: "packed" };
  const i = t.travelers.findIndex((x) => x.id === list);
  return i < 0 ? null : { items: t.travelers[i].packing, packed: t.travelers[i].packed, path: `travelers/${i}/packed` };
}

export const isPacked = (t: Trip, list: string, item: string) => !!packingList(t, list)?.packed.includes(item);

export function packedCount(t: Trip, list: string) {
  const l = packingList(t, list);
  return { packed: l ? l.items.filter((x) => l.packed.includes(x)).length : 0, total: l?.items.length ?? 0 };
}

export function togglePacked(t: Trip, list: string, item: string): Op[] {
  const l = packingList(t, list);
  if (!l) return [];
  const value = l.packed.includes(item) ? l.packed.filter((x) => x !== item) : [...l.packed, item];
  return [{ op: "set", path: l.path, value }];
}

export function removePacking(t: Trip, list: string, index: number): Op[] {
  const path = packingPath(t, list), l = packingList(t, list);
  if (!path || !l) return [];
  const item = l.items[index];
  const stillThere = l.items.some((x, n) => n !== index && x === item); // another item with the same text keeps the check
  return [
    { op: "remove", path: `${path}/${index}` },
    ...(l.packed.includes(item) && !stillThere ? [{ op: "set" as const, path: l.path, value: l.packed.filter((x) => x !== item) }] : []),
  ];
}
