// Day logic for Uppleva and for choosing the tab when a trip opens.
import { dateBadge } from "./format.ts";
import { sv } from "./sv.ts";

type DayLike = { id: string; date: string };

/** Today's date (YYYY-MM-DD) in the trip's time zone (LC-04). */
export const todayIn = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const sorted = <D extends DayLike>(days: D[]) => [...days].sort((a, b) => a.date.localeCompare(b.date));

/** Today, else the nearest coming day, else the last day (UP-01). */
export function pickDay<D extends DayLike>(days: D[], today: string): D | undefined {
  const s = sorted(days);
  return s.find((d) => d.date >= today) ?? s[s.length - 1];
}

/** Nåla before the trip, Uppleva during it, Summera after it (MT-09). */
export function defaultTab(days: DayLike[], today: string): "nala" | "up" | "mi" {
  const s = sorted(days);
  if (!s.length || today < s[0].date) return "nala";
  return today > s[s.length - 1].date ? "mi" : "up";
}

export function dayHeading(date: string, today: string) {
  const { d, w } = dateBadge(date);
  const text = `${w} ${d} ${sv.months[Number(date.slice(5, 7)) - 1]}`;
  return date === today ? `${sv.today} · ${text}` : text;
}

/** Bookings valid on the day, without cancelled ones (UP-05). */
export const bookingsOn = <B extends { from: string; to: string; status: string }>(bookings: B[], date: string) =>
  bookings.filter((b) => b.status !== "cancelled" && b.from <= date && date <= b.to).map((b) => ({ ...b, startsToday: b.from === date }));

/** Budget status in Uppleva (UP-06). */
export function budgetStatus(budget: { amount: number; paid: boolean }[], expenses: { amount: number }[]) {
  const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((a, x) => a + x.amount * 100, 0)) / 100;
  const planned = sum(budget), paid = sum(budget.filter((b) => b.paid));
  return { planned, paid, left: Math.round((planned - paid) * 100) / 100, spent: sum(expenses) };
}
