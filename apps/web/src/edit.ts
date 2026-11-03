// Builds the changes (ops) for editing in Nåla. Pure, so it runs under node --test (ED-01..ED-08).
import type { BookingReading, Op, TicketFile, Trip } from "@trip/schema";
import { dateBadge } from "./format.ts";
import { parseAmount } from "./money.ts";
import { sv } from "./sv.ts";
import { TIME_POINT } from "./categories.ts";

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
export const allIds = (t: Trip) => [
  ...t.days, ...t.places, ...t.bookings, ...t.tasks, ...t.travelers, ...t.dreams, ...t.budget, ...t.expenses, ...t.payments, ...t.info,
  ...t.days.flatMap((d) => d.activities),
].map((x) => x.id);

/** A new traveler by name, with a readable id unique in the trip (MI-01, AU-26). */
export function addTraveler(t: Trip, input: string): Result {
  const name = input.trim();
  if (!name) return fail(sv.errors.name);
  return ok([{ op: "add", path: "travelers/-", value: { id: uniqueId(name, allIds(t)), name, packing: [], packed: [] } }]);
}

/** A new name for a traveler; the id stays, so links, accounts, expenses and packing lists are kept (AU-32). */
export function renameTraveler(t: Trip, id: string, input: string): Result {
  const name = input.trim(), i = t.travelers.findIndex((x) => x.id === id);
  if (!name) return fail(sv.errors.name);
  if (i < 0) return fail(sv.errors.person);
  return ok(t.travelers[i]!.name === name ? [] : [{ op: "set", path: `travelers/${i}/name`, value: name }]);
}

export const splitIcons = (s: string) =>
  [...new Intl.Segmenter("sv", { granularity: "grapheme" }).segment(s.replace(/\s+/g, ""))].map((x) => x.segment);

export function saveTrip(t: Trip, input: { title: string; purpose: string }): Result {
  const title = input.title.trim();
  if (!title) return fail(sv.errors.title);
  return ok([{ op: "set", path: "title", value: title }, { op: "set", path: "purpose", value: input.purpose.trim() }]);
}

/** The maximum budget; empty clears it (BG-12). */
export function saveBudgetMax(t: Trip, input: string): Result {
  if (!input.trim()) return ok(t.budgetMax === undefined ? [] : [{ op: "remove", path: "budgetMax" }]);
  const n = parseAmount(input);
  return Number.isNaN(n) ? fail(sv.badAmount) : ok([{ op: "set", path: "budgetMax", value: n }]);
}

/** The planning rules as the form shows them: hours of driving ("5,5"), minutes of buffer (DM-15). */
export type RulesInput = { day: string; stretch: string; buffer: string };
const hours = (min?: number) => (min === undefined ? "" : String(Math.round((min / 60) * 100) / 100).replace(".", ","));
export const rulesForm = (t: Trip): RulesInput => ({ day: hours(t.rules?.maxTravelDayMin), stretch: hours(t.rules?.maxDriveStretchMin), buffer: t.rules?.bufferMin === undefined ? "" : String(t.rules.bufferMin) });
/** Sets, changes or clears the planning rules; travel and driving must be more than nothing, the buffer may be 0. Saved by hand they
 * are no longer marked as AI (DM-15, AI-93). */
export function saveRules(t: Trip, input: RulesInput): Result {
  const num = (s: string) => (s.trim() ? parseAmount(s) : undefined);
  const day = num(input.day), stretch = num(input.stretch), buffer = num(input.buffer);
  if ([day, stretch].some((x) => x !== undefined && (Number.isNaN(x) || x <= 0)) || (buffer !== undefined && (Number.isNaN(buffer) || buffer < 0))) return fail(sv.badAmount);
  const rules = clean({ maxTravelDayMin: day && Math.round(day * 60), maxDriveStretchMin: stretch && Math.round(stretch * 60), bufferMin: buffer === undefined ? undefined : Math.round(buffer) });
  return ok(Object.keys(rules).length ? [{ op: "set", path: "rules", value: rules }] : t.rules ? [{ op: "remove", path: "rules" }] : []);
}

export type DayInput = {
  date: string; title: string; summary: string; icons: string; start: string; end: string;
  startEstimated: boolean; endEstimated: boolean; location: string;
  weather?: { lat: number; lon: number } | null; // undefined: keep, null: remove
  country?: string | null; // the same (UP-24)
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
    aiTitle: old?.aiTitle && old.title === input.title.trim() ? true : undefined, // a changed title is the person's own (AI-86)
    weather: input.weather === undefined ? old?.weather : input.weather ?? undefined,
    country: input.country === undefined ? old?.country : input.country ?? undefined,
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

/** "move": the days keep their order and plan on the new dates (ED-30); "length": they stay on their dates (ED-14). */
export type DatesMode = "move" | "length";
const byDate = (t: Trip) => [...t.days].sort((a, b) => a.date.localeCompare(b.date));
const badgeOf = (iso: string) => { const b = dateBadge(iso); return `${b.d} ${b.w}`; };
const addDaysTo = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The choice the dates form offers: none when the first date stays or the trip has no days; moving is preselected when the
 * new dates do not overlap the old ones (ED-30). */
export function datesMode(t: Trip, from: string, to: string): DatesMode | null {
  const r = tripRange(t);
  if (!r || !isDate(from) || !isDate(to) || from === r.from) return null;
  return to < r.from || from > r.to ? "move" : "length";
}

/** The last date of the trip moved to start on `from`, with as many days as now; null without days (ED-31). */
export function movedTo(t: Trip, from: string) {
  const r = tripRange(t);
  return r && isDate(from) ? addDaysTo(from, daysBetween(r.from, r.to)) : null;
}

/** What the dates form shows: the last date follows the first while "Flytta resan" is chosen and the user has not typed one;
 * the preselected choice compares the moved trip with the old one (ED-30, ED-31). */
export function datesForm(t: Trip, from: string, to: string, picked: DatesMode | null, toTyped: boolean) {
  const follow = toTyped ? null : movedTo(t, from);
  const offered = datesMode(t, from, follow ?? to);
  if (!offered) return { to: toTyped ? to : tripRange(t)?.to ?? to, mode: "length" as DatesMode, offered: false };
  const mode = picked ?? offered;
  return { to: follow ? (mode === "move" ? follow : tripRange(t)!.to) : to, mode, offered: true };
}

/** The days a change of dates removes: when moving, those beyond the new number of days (ED-30). */
export const removedDays = (t: Trip, input: { from: string; to: string }, mode: DatesMode = "length") =>
  mode === "move" ? byDate(t).slice(datesBetween(input.from, input.to).length) : daysOutside(t, input.from, input.to);

export function setTripDates(t: Trip, input: { from: string; to: string }, mode: DatesMode = "length"): Result {
  if (!isDate(input.from) || !isDate(input.to)) return fail(sv.errors.dates);
  if (input.to < input.from) return fail(sv.errors.toBeforeFrom);
  const dates = datesBetween(input.from, input.to);
  if (dates.length > MAX_DAYS) return fail(sv.errors.tooLong);
  const taken = allIds(t);
  const ops: Op[] = [];
  let have = new Set(t.days.map((d) => d.date)), fresh = dates;
  if (mode === "move" && t.days.length) {
    // Sets first, by the days' places in the list as they are; the removals after them change those places.
    const order = byDate(t);
    order.slice(0, dates.length).forEach((d, i) => {
      if (d.date === dates[i]) return;
      ops.push({ op: "set", path: `days/${t.days.indexOf(d)}/date`, value: dates[i] });
      t.stops.forEach((s, j) => { if (s.dayId === d.id && s.sub === badgeOf(d.date)) ops.push({ op: "set", path: `stops/${j}/sub`, value: badgeOf(dates[i]!) }); });
    });
    const shift = daysBetween(order[0]!.date, input.from);
    if (shift) t.tasks.forEach((k, n) => { if (k.due) ops.push({ op: "set", path: `tasks/${n}/due`, value: addDaysTo(k.due, shift) }); }); // TK-11
    have = new Set(); fresh = dates.slice(order.length);
  }
  const gone = new Set(removedDays(t, input, mode).map((d) => d.id));
  ops.push(
    ...removeAt("stops", t.stops.flatMap((s, n) => (gone.has(s.dayId) ? [n] : []))),
    ...removeAt("days", t.days.flatMap((d, n) => (gone.has(d.id) ? [n] : []))),
  );
  for (const date of fresh.filter((x) => !have.has(x))) {
    const id = uniqueId(`day-${date}`, taken);
    taken.push(id);
    ops.push(
      { op: "add", path: "days/-", value: { id, date, title: sv.newDay, summary: sv.emptyDay, icons: ["📅"], start: "09:00", end: "18:00", estimated: true, legs: [], activities: [] } },
      { op: "add", path: "stops/-", value: { label: sv.newDay, sub: badgeOf(date), dayId: id } },
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
  hiddenFrom?: string[]; // undefined: keep, []: shown to everyone (AU-18)
  dreamId?: string; // undefined: keep, "": no wish (MI-19)
  newWish?: boolean; // a new wish with the activity's title and category, linked to it, unless a wish is chosen (ED-29)
  travel?: Activity["travel"] | false | null; // undefined: keep, false: none, null: not valid (TR-20)
};

const VEHICLES = ["walk", "transit", "car", "train", "ferry"] as const;
/** Whether the form proposes a new wish: not for a moment or a journey, an activity hidden from someone, or a role that may not
 * change wishes (ED-29). */
export const wishByDefault = (category: string, hiddenFrom: string[], mayWish: boolean) =>
  mayWish && !hiddenFrom.length && category !== TIME_POINT && category !== "Resa";

/** The way to an activity as typed in the form: false when no vehicle is chosen; null when the minutes are no whole number (TR-20). */
export function travelInput(vehicle: string, minutes: string): Activity["travel"] | false | null {
  if (!vehicle) return false;
  const n = Number(minutes.trim());
  if (!(VEHICLES as readonly string[]).includes(vehicle) || !Number.isInteger(n) || n <= 0) return null;
  return { vehicle: vehicle as (typeof VEHICLES)[number], durationMin: n };
}

/** Timed activities in time order, untimed last (ED-05). */
export const byTime = (list: Activity[]) =>
  [...list].sort((a, b) => (a.start ? (b.start ? a.start.localeCompare(b.start) : -1) : b.start ? 1 : 0));

export function saveActivity(t: Trip, dayId: string, input: ActivityInput, id?: string): Result {
  const di = t.days.findIndex((d) => d.id === dayId);
  if (di < 0) return fail(sv.errors.day);
  const text = input.text.trim();
  if (!text) return fail(sv.errors.text);
  if (input.start && !isTime(input.start)) return fail(sv.errors.activityTime);
  if (input.travel === null) return fail(sv.errors.travel);
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
  const category = input.category === undefined ? old?.category : input.category || undefined;
  let dreamId = input.dreamId;
  if (input.newWish && !dreamId) { // ED-29: the wish first, so the link points at something that exists (MI-19)
    dreamId = uniqueId(text, taken);
    taken.push(dreamId);
    ops.push({ op: "add", path: "dreams/-", value: { id: dreamId, title: text, category: category && category !== TIME_POINT ? category : "Aktivitet", source: sv.manual, icon: "✨", votes: 0 } });
  }
  const point = category === TIME_POINT && !!input.start; // a moment: no duration, ends at its start (ED-20)
  const activity: Activity = clean({
    ...old, id: old?.id ?? uniqueId(text, taken), text, placeIds,
    start: input.start || undefined, estimated: !!input.start && input.estimated,
    category,
    durationMin: point ? undefined : input.durationMin ?? old?.durationMin,
    note: input.note === undefined ? old?.note : input.note.trim() || undefined,
    hiddenFrom: input.hiddenFrom === undefined ? old?.hiddenFrom : input.hiddenFrom.length ? input.hiddenFrom : undefined,
    dreamId: dreamId === undefined ? old?.dreamId : dreamId || undefined,
    travel: input.travel === undefined ? old?.travel : input.travel || undefined,
    end: point ? input.start : input.durationMin === undefined ? old?.end : undefined, // the form sets a duration, which replaces a fixed end
  });
  const fixed = (a: Activity) => JSON.stringify([a.start, a.end, a.durationMin, !!a.estimated]);
  if (old?.pinned && fixed(old) !== fixed(activity)) return fail(sv.errors.pinned); // ED-25: unpin first
  const next = old ? list.map((a) => (a.id === old.id ? activity : a)) : [...list, activity];
  ops.push({ op: "set", path: `days/${di}/activities`, value: byTime(next) });
  return ok(ops);
}

/** A pinned activity is not removed until it is unpinned (ED-25). */
export function removeActivity(t: Trip, dayId: string, id: string): Op[] {
  const di = t.days.findIndex((d) => d.id === dayId);
  if (di < 0 || t.days[di].activities.find((a) => a.id === id)?.pinned) return [];
  return [{ op: "set", path: `days/${di}/activities`, value: t.days[di].activities.filter((a) => a.id !== id) }];
}

/** Pins an activity, which fixes its time (no "ca"), or unpins it, which keeps its time (ED-24). */
export function togglePin(t: Trip, dayId: string, id: string): Result {
  const di = t.days.findIndex((d) => d.id === dayId), ai = t.days[di]?.activities.findIndex((a) => a.id === id) ?? -1;
  if (ai < 0) return fail(sv.errors.move);
  const a = t.days[di].activities[ai];
  const { pinned: _, ...rest } = a;
  return ok([{ op: "set", path: `days/${di}/activities/${ai}`, value: a.pinned ? rest : { ...a, pinned: true, estimated: false } }]);
}

export type BookingInput = {
  name: string; from: string; to: string; status: "tobook" | "paid" | "ready" | "cancelled"; reference: string; placeId: string;
  note?: string; // undefined: keep, "": remove (BK-06)
  kind?: "stay" | "ticket" | "other" | "transport"; checkIn?: string; checkOut?: string; start?: string; activityId?: string; // undefined: keep (BK-07, BK-08)
  origin?: string; destination?: string; arrival?: string; // a Resa; undefined: keep (BK-37)
  files?: TicketFile[]; // undefined: keep (BK-09)
  price?: string; currency?: string; // the booking's own budget item; undefined: keep, "": remove (BK-25)
  rate?: Rate; // fetched when saved, for a price in another currency (BK-25, BG-07)
  newPlace?: NewPlace; // the place to add when placeId is "__new" (BK-36)
};
/** A place read from a confirmation, added with the booking (BK-36). */
export type NewPlace = { name: string; address: string; phone: string; website: string };
/** The trip's currency per unit of another, and the date of the rate (BG-07). */
export type Rate = { rate: number; date: string };
/** The rate fields of a budget item in `currency`: the new rate, else the old one of the same currency; none in the trip's currency (BG-07). */
const rateOf = (t: Trip, currency: string | undefined, rate: Rate | undefined, old?: { currency?: string; rate?: number; rateDate?: string }) =>
  !currency || currency === t.currency ? {} : rate ? { rate: rate.rate, rateDate: rate.date }
    : old?.currency === currency ? { rate: old.rate, rateDate: old.rateDate } : {};

/** The activities a Biljett can be linked to: those on its first date (BK-08). */
export const ticketActivities = (t: Trip, date: string) => t.days.filter((d) => d.date === date).flatMap((d) => d.activities);

export function saveBooking(t: Trip, input: BookingInput, id?: string): Result {
  const name = input.name.trim();
  if (!name) return fail(sv.errors.name);
  if (!isDate(input.from) || !isDate(input.to)) return fail(sv.errors.dates);
  if (input.to < input.from) return fail(sv.errors.toBeforeFrom);
  const i = id ? t.bookings.findIndex((b) => b.id === id) : -1;
  const old = t.bookings[i];
  const kind = input.kind ?? old?.kind;
  const time = (v: string | undefined, keep?: string) => (v === undefined ? keep : v.trim() || undefined);
  const times = input.kind === undefined ? {} : { // only the times and the link that belong to the kind (BK-07, BK-08)
    checkIn: kind === "stay" ? time(input.checkIn, old?.checkIn) : undefined, checkOut: kind === "stay" ? time(input.checkOut, old?.checkOut) : undefined,
    start: kind === "ticket" || kind === "transport" ? time(input.start, old?.start) : undefined, activityId: kind === "ticket" ? time(input.activityId, old?.activityId) : undefined,
    origin: kind === "transport" ? time(input.origin, old?.origin) : undefined, destination: kind === "transport" ? time(input.destination, old?.destination) : undefined,
    arrival: kind === "transport" ? time(input.arrival, old?.arrival) : undefined, // BK-37
  };
  if ([times.checkIn, times.checkOut, times.start, times.arrival].some((x) => x !== undefined && !isTime(x))) return fail(sv.errors.activityTime);
  if (times.activityId && !ticketActivities(t, input.from).some((a) => a.id === times.activityId)) return fail(sv.errors.activityDate);
  const price = input.price?.trim() ? parseAmount(input.price) : undefined;
  if (Number.isNaN(price)) return fail(sv.badAmount);
  const files = input.files === undefined ? old?.files : input.files.length ? input.files : undefined;
  let placeId = input.placeId || undefined, placeOps: Op[] = [];
  if (placeId === NEW_PLACE) { // BK-36: the place first, so the booking points at something that exists
    const np = { name: "", address: "", phone: "", website: "", ...input.newPlace }; // chosen by hand: nothing read yet
    const r = savePlace(t, { bookingUrl: "", bookingLabel: "", notes: "", ...np, name: np.name.trim() || name });
    if (!r.ok) return r;
    placeOps = r.ops; placeId = (r.ops[0] as { value: { id: string } }).value.id;
  }
  const { files: _f, checkIn: _ci, checkOut: _co, start: _s, activityId: _a, origin: _o, destination: _d, arrival: _ar, ...rest } = old ?? {};
  const booking = clean({
    ...(input.kind === undefined ? old : rest), id: old?.id ?? uniqueId(name, [...allIds(t), ...(placeId ? [placeId] : [])]), name, from: input.from, to: input.to, status: input.status,
    reference: input.reference.trim() || undefined, placeId,
    note: input.note === undefined ? old?.note : input.note.trim() || undefined,
    kind, ...times, files,
  });
  return ok([...placeOps, old ? { op: "set", path: `bookings/${i}`, value: booking } : { op: "add", path: "bookings/-", value: booking },
    ...(input.price === undefined ? [] : priceOps(t, booking as Booking, price, input.currency, input.rate))]);
}

const PRICE_CATEGORY: Record<string, string> = { stay: "Boende", ticket: "Upplevelse", transport: "Transport" };
/** The booking's own budget item: added, updated (keeping its category) or, without a price, removed (BK-25). */
function priceOps(t: Trip, b: Booking, price: number | undefined, currency?: string, rate?: Rate): Op[] {
  const i = t.budget.findIndex((x) => x.bookingId === b.id), old = t.budget[i];
  if (price === undefined) return old ? removeAt("budget", [i]) : [];
  const item = clean({
    ...old, id: old?.id ?? uniqueId(`${b.id}-pris`, allIds(t)), bookingId: b.id, category: old?.category ?? PRICE_CATEGORY[b.kind ?? ""] ?? "Övrigt",
    note: b.name, amount: price, currency: currency || t.currency, paid: b.status === "paid", amountMax: undefined, estimate: undefined,
    rate: undefined, rateDate: undefined, ...rateOf(t, currency || t.currency, rate, old),
  });
  return [old ? { op: "set", path: `budget/${i}`, value: item } : { op: "add", path: "budget/-", value: item }];
}
/** A price as the form shows it: "1250" or "1250,50". */
const priceText = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

export const NEW_PLACE = "__new";
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** The place a reading points at: a place of the trip with its name, else a new one when an address was read; a place already chosen stays (BK-36). */
function readPlace(t: Pick<Trip, "places"> | undefined, f: BookingInput, r: BookingReading): Partial<Pick<BookingInput, "placeId" | "newPlace">> {
  if (f.placeId && f.placeId !== NEW_PLACE) return {};
  const same = r.name ? t?.places.find((p) => plain(p.name) === plain(r.name!)) : undefined;
  if (same) return { placeId: same.id };
  if (!r.address) return {};
  return { placeId: NEW_PLACE, newPlace: { name: r.name ?? f.newPlace?.name ?? "", address: r.address, phone: r.phone ?? "", website: r.website ?? "" } };
}

/** The fields read from a mail or a pasted confirmation fill in the form; what was not read stays (BK-17, BK-18). */
export function readingToForm(f: BookingInput, r: BookingReading, t?: Pick<Trip, "places">): BookingInput {
  const kind = r.kind === "stay" || r.kind === "ticket" || r.kind === "transport" ? r.kind : r.kind ? "other" : f.kind;
  return {
    ...f, kind, name: r.name ?? f.name, from: r.from ?? f.from, to: r.to ?? r.from ?? f.to, reference: r.reference ?? f.reference,
    status: r.status ?? f.status, checkIn: r.checkIn ?? f.checkIn, checkOut: r.checkOut ?? f.checkOut, start: r.start ?? f.start,
    ...(r.origin && { origin: r.origin }), ...(r.destination && { destination: r.destination }), ...(r.arrival && { arrival: r.arrival }), // BK-37
    ...(r.price && { price: priceText(r.price.value), currency: r.price.currency }), // BK-25
    ...readPlace(t, f, r), // BK-36
  };
}

type Booking = Trip["bookings"][number];

/** The booking form for a booking, or for a new one on the trip's first date. */
export function bookingForm(t: Trip, b?: Booking): BookingInput {
  const first = [...t.days].sort((x, y) => x.date.localeCompare(y.date))[0]?.date ?? "";
  return {
    name: b?.name ?? "", from: b?.from ?? first, to: b?.to ?? first, status: b?.status ?? "ready", reference: b?.reference ?? "", placeId: b?.placeId ?? "",
    note: b?.note ?? "", kind: b?.kind ?? "other", checkIn: b?.checkIn ?? "", checkOut: b?.checkOut ?? "", start: b?.start ?? "", activityId: b?.activityId ?? "",
    origin: b?.origin ?? "", destination: b?.destination ?? "", arrival: b?.arrival ?? "",
    files: b?.files ?? [], ...priceField(t, b),
  };
}
const priceField = (t: Trip, b?: Booking) => {
  const item = b && t.budget.find((x) => x.bookingId === b.id);
  return { price: item?.amount !== undefined ? priceText(item.amount) : "", currency: item?.currency ?? t.currency };
};

const STOP = new Set(["till", "från", "eller", "efter", "inför", "under", "utan", "with", "from", "your", "this", "that", "bokning", "booking"]);
/** The words of at least four letters, in lower case. */
const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w)));
const shared = (a: string, b: string) => { const w = words(b); return [...words(a)].filter((x) => w.has(x)).length; };
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

/** The "Att boka" bookings a reading may be the confirmation of, the best first (BK-22). */
export function toBookMatches(t: Trip, r: BookingReading): Booking[] {
  const to = r.to ?? r.from;
  return t.bookings.flatMap((b) => {
    const kind = b.kind ?? "other", n = r.name ? shared(r.name, b.name) : 0;
    const overlap = !!r.from && r.from <= b.to && to! >= b.from;
    if (b.status !== "tobook" || (r.kind && r.kind !== kind) || (r.from && !overlap)) return [];
    return n > 0 || (r.kind && overlap) ? [{ b, n, d: r.from ? days(r.from, b.from) : 0 }] : [];
  }).sort((x, y) => y.n - x.n || x.d - y.d).map((x) => x.b);
}

/** The "Att boka" booking a reading completed by "Läs med AI" fills in: the reviewer's choice, else the best match (BK-22, AI-60). */
export const targetAfterAi = (t: Trip, r: BookingReading, target: string, picked: boolean) =>
  target || picked ? target : toBookMatches(t, r)[0]?.id ?? "";

/** The form for an "Att boka" booking filled in with a reading: now booked, with its own and the mail's ticket files (BK-22). */
export function matchedForm(t: Trip, b: Booking, r: BookingReading, files: TicketFile[]): BookingInput {
  const f = readingToForm(bookingForm(t, b), r, t);
  return { ...f, status: r.status ?? "ready", files: [...(b.files ?? []), ...files] };
}

/** The activity on the first date a ticket is most likely for: most shared words, else the same start time; only one best (BK-23). */
export function ticketActivityFor(t: Trip, name: string, date: string, start?: string): string | undefined {
  const scored = ticketActivities(t, date).map((a) => ({ id: a.id, n: shared(name, a.text) * 2 + (start && a.start === start ? 1 : 0) }))
    .filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
  return scored[0] && scored[0].n !== scored[1]?.n ? scored[0].id : undefined;
}

export const removeBooking = (t: Trip, id: string): Op[] => [ // with its own budget item (BK-25)
  ...removeAt("bookings", [t.bookings.findIndex((b) => b.id === id)]), ...removeAt("budget", t.budget.flatMap((x, i) => (x.bookingId === id ? [i] : []))),
];

export type BudgetInput = {
  category: string; amount: string; paid: boolean; owner: string;
  estimate?: boolean; amountMax?: string; currency?: string; note?: string; // BG-03, BG-06, BG-07
  rate?: Rate; // fetched when saved, for another currency (BG-07)
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
    ...rateOf(t, currency, input.rate, old),
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
