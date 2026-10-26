// Pure display logic. Kept free of React so it runs under node --test.
import { sv } from "./sv.ts";
import { secretsOf, textHiddenFrom, whoFor } from "@trip/schema/src/hidden.ts";

type DayLike = { id: string; date: string; start: string; end: string; estimated: boolean; startEstimated?: boolean; endEstimated?: boolean; location?: string };
type Vehicle = "car" | "ferry" | "train" | "transit" | "walk";
type BudgetLike = { category: string; amount?: number; paid: boolean; estimate?: boolean };
export type Open = Record<string, boolean>;

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};
const hhmm = (t: string) => t.replace(":", ".");
const ca = (t: string, est: boolean | undefined) => (est ? "ca " : "") + hhmm(t);

export const dateBadge = (iso: string) => { const p = parts(iso); return { d: String(p.d), w: sv.weekdays[p.wd] }; };

export const dayTime = (d: DayLike) =>
  `${ca(d.start, d.startEstimated ?? d.estimated)}–${ca(d.end, d.endEstimated ?? d.estimated)}`;

/** Only the start: the next activity's start shows when this one ends (TM-05). */
export const activityTime = (a: { start?: string; estimated: boolean }) => (a.start ? ca(a.start, a.estimated) : "");

export const kr = (n: number) =>
  n.toLocaleString("sv-SE", Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";

const dayMonth = (iso: string) => { const p = parts(iso); return `${p.d} ${sv.months[p.m - 1]}`; };
export const shortDate = (iso: string) => `${dayMonth(iso)} ${parts(iso).y}`;

export function tripDates(t: { days: { date: string }[]; dateLabel?: string }) {
  if (t.dateLabel) return t.dateLabel;
  if (!t.days.length) return sv.noDates;
  const ds = t.days.map((d) => d.date).sort();
  const last = ds[ds.length - 1];
  return `${dayMonth(ds[0])} – ${dayMonth(last)} ${parts(last).y}`;
}

export const excerpt = (purpose: string) => (purpose || sv.noPurpose).slice(0, 70) + "…";

export function bookingDates(b: { from: string; to: string }) {
  if (b.from === b.to) return dayMonth(b.from);
  const f = parts(b.from), t = parts(b.to);
  return f.m === t.m ? `${f.d}–${t.d} ${sv.months[t.m - 1]}` : `${dayMonth(b.from)} – ${dayMonth(b.to)}`;
}

/** The times of a booking after its dates: check-in and check-out of a Boende, the start of a Biljett (BK-07). */
export function bookingTimes(b: { kind?: string; checkIn?: string; checkOut?: string; start?: string }) {
  if (b.kind === "stay") return [b.checkIn && `${sv.bookingKinds.in} ${hhmm(b.checkIn)}`, b.checkOut && `${sv.bookingKinds.out} ${hhmm(b.checkOut)}`].filter(Boolean).join(" · ");
  return b.kind === "ticket" && b.start ? `kl. ${hhmm(b.start)}` : "";
}

const vehicleIcon: Record<Vehicle, string> = { car: "🚗", ferry: "🚢", train: "🚆", transit: "🚇", walk: "🚶" };
export const vehicleIcons = (d: { legs: { vehicle: Vehicle }[] }) =>
  [...new Set(d.legs.map((l) => vehicleIcon[l.vehicle]))].join("");

export const routeLabel = (days: { date: string; location?: string }[]) =>
  [...new Set(days.map((d) => d.location).filter((l): l is string => !!l))].join(" → ");

/** A day title, or "Dold rubrik" when it would give away a hidden activity (AU-27). */
export const dayTitle = (d: { title: string; hiddenTitle?: boolean }) => (d.hiddenTitle ? sv.hiddenTitle : d.title);
type Secrets = Parameters<typeof secretsOf>[0];
type Placed = Secrets & { places: { id: string; name: string; notes?: string }[] };
/** Whom texts are hidden from, for their eye: an activity hidden anywhere in the trip that they resemble, also through the
 * name and notes of a place they link (AU-30). */
export function textWho(t: Placed, texts: (string | undefined)[], placeId?: string) {
  const p = t.places.find((x) => x.id === placeId);
  return whoFor(secretsOf(t), [...texts, p?.name, p?.notes]);
}
/** Whom a text of a day is hidden from: the hidden activities of that day (AU-27) and of the whole trip (AU-30). */
export function dayTextWho(t: Secrets | undefined, d: Parameters<typeof textHiddenFrom>[0], text: string) {
  const out = textHiddenFrom(d, text);
  for (const id of t ? whoFor(secretsOf(t), [text]) : []) if (!out.includes(id)) out.push(id);
  return out;
}
/** Whom the day title is hidden from, for its eye (AU-27, AU-29, AU-30); none when the title already reached the viewer hidden. */
export const titleHiddenFrom = (d: Parameters<typeof textHiddenFrom>[0] & { title: string; hiddenTitle?: boolean }, t?: Secrets) =>
  (d.hiddenTitle ? [] : dayTextWho(t, d, d.title));
/** A timeline label; the server empties one that would give away a hidden activity (AU-27). */
export const stopLabel = (s: { label: string }) => s.label || sv.hiddenTitle;

/** The id of the day whose date is today, for marking its card and timeline stop (DC-15). */
export const todayId = (days: { id: string; date: string }[], today: string) => days.find((d) => d.date === today)?.id;

export function timelineStops<S extends { dayId: string }>(t: { days: { id: string; date: string }[]; stops: S[] }) {
  const date = new Map(t.days.map((d) => [d.id, d.date]));
  return t.stops.filter((s) => date.has(s.dayId)).sort((a, b) => date.get(a.dayId)!.localeCompare(date.get(b.dayId)!));
}

export const paidTotal = (items: BudgetLike[]) => items.filter((i) => i.paid && !i.estimate).reduce((a, i) => a + (i.amount ?? 0), 0);

export function budgetByCategory(items: BudgetLike[]): [string, number][] {
  const g = new Map<string, number>();
  for (const i of items) if (i.amount !== undefined) g.set(i.category, (g.get(i.category) ?? 0) + i.amount);
  return [...g];
}

/** Font size (viewBox units) of the donut total, so it fits the 62-unit hole with a margin; about 0.6 em per character (BG-11). */
export const donutTotalSize = (text: string) => Math.min(10, Math.floor((48 / (0.6 * text.length)) * 10) / 10);

export const anyOpen = (open: Open) => Object.values(open).some(Boolean);
export const toggleOne = (open: Open, id: string): Open => ({ ...open, [id]: !open[id] });
export const toggleAll = (open: Open, ids: string[]): Open => (anyOpen(open) ? {} : Object.fromEntries(ids.map((id) => [id, true])));
/** Which parts of Nåla are unlocked for editing: everything (`all`), with per-part exceptions (ED-13, ED-18). */
export type Unlock = { all: boolean; ids: Record<string, boolean> };
export const LOCKED: Unlock = { all: false, ids: {} };
export const isUnlocked = (u: Unlock, id: string) => u.ids[id] ?? u.all;
export const anyUnlocked = (u: Unlock) => u.all || Object.values(u.ids).some(Boolean);
export const toggleUnlock = (u: Unlock, id: string): Unlock => ({ ...u, ids: { ...u.ids, [id]: !isUnlocked(u, id) } });
/** The edit mode button: unlocks everything, or locks everything when anything is unlocked. */
export const toggleAllUnlock = (u: Unlock): Unlock => ({ all: !anyUnlocked(u), ids: {} });
export const unlockLabel = (on: boolean, part: string) => `${on ? sv.lockPart : sv.unlockPart} ${part}`;
/** The lock button in Nåla turns edit mode on and off (ED-13). */
export const editModeLabel = (on: boolean) => (on ? sv.editModeOff : sv.editModeOn);
export const toggleAllLabel = (open: Open) => (anyOpen(open) ? sv.collapseAll : sv.expandAll);
export const jumpTo = (id: string): Open => ({ [id]: true });
export const scrollBehavior = (reducedMotion: boolean): ScrollBehavior => (reducedMotion ? "auto" : "smooth");
