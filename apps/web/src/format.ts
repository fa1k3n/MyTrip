// Pure display logic. Kept free of React so it runs under node --test.
import { sv } from "./sv.ts";

type DayLike = { id: string; date: string; start: string; end: string; estimated: boolean; startEstimated?: boolean; endEstimated?: boolean; location?: string };
type Vehicle = "car" | "ferry" | "train" | "transit" | "walk";
type BudgetLike = { category: string; amount: number; paid: boolean };
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

const vehicleIcon: Record<Vehicle, string> = { car: "🚗", ferry: "🚢", train: "🚆", transit: "🚇", walk: "🚶" };
export const vehicleIcons = (d: { legs: { vehicle: Vehicle }[] }) =>
  [...new Set(d.legs.map((l) => vehicleIcon[l.vehicle]))].join("");

export const routeLabel = (days: { date: string; location?: string }[]) =>
  [...new Set(days.map((d) => d.location).filter((l): l is string => !!l))].join(" → ");

export function timelineStops<S extends { dayId: string }>(t: { days: { id: string; date: string }[]; stops: S[] }) {
  const date = new Map(t.days.map((d) => [d.id, d.date]));
  return t.stops.filter((s) => date.has(s.dayId)).sort((a, b) => date.get(a.dayId)!.localeCompare(date.get(b.dayId)!));
}

export const paidTotal = (items: BudgetLike[]) => items.filter((i) => i.paid).reduce((a, i) => a + i.amount, 0);

export function budgetByCategory(items: BudgetLike[]): [string, number][] {
  const g = new Map<string, number>();
  for (const i of items) g.set(i.category, (g.get(i.category) ?? 0) + i.amount);
  return [...g];
}

export const anyOpen = (open: Open) => Object.values(open).some(Boolean);
export const toggleOne = (open: Open, id: string): Open => ({ ...open, [id]: !open[id] });
export const toggleAll = (open: Open, ids: string[]): Open => (anyOpen(open) ? {} : Object.fromEntries(ids.map((id) => [id, true])));
export const toggleAllLabel = (open: Open) => (anyOpen(open) ? sv.collapseAll : sv.expandAll);
export const jumpTo = (id: string): Open => ({ [id]: true });
export const scrollBehavior = (reducedMotion: boolean): ScrollBehavior => (reducedMotion ? "auto" : "smooth");
