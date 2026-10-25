// What the phone keeps for working offline: the last fetched trip per link (PW-03, PW-05, PW-17). Pure, so it runs under node --test.
import { sv } from "./sv.ts";

/** Local storage, or a stand-in in the tests. */
export type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; key(i: number): string | null; readonly length: number };
/** The last answers the server gave a link, and when the trip and the weather were fetched. */
export type Copy = { me?: unknown; trips?: unknown; at?: string; forecast?: unknown; forecastAt?: string };

const PREFIX = "mytrip.copy.";
export function loadCopy(s: Store, link: string): Copy | null {
  try { return JSON.parse(s.getItem(PREFIX + link) ?? "null") as Copy | null; } catch { return null; }
}
/** Keeps the trip (me, trips) or the weather (forecast) of a link, each with the time it was fetched. */
export function saveCopy(s: Store, link: string, part: Pick<Copy, "me" | "trips" | "forecast">, at: string) {
  const old = loadCopy(s, link) ?? {};
  const stamp = "forecast" in part ? { forecastAt: at } : { at };
  try { s.setItem(PREFIX + link, JSON.stringify({ ...old, ...part, ...stamp })); } catch { /* storage full or blocked: online only */ }
}
export const dropCopy = (s: Store, link: string) => s.removeItem(PREFIX + link);
/** #admin removes every link and so every copy (PW-17). */
export function dropAllCopies(s: Store) {
  const keys = Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => !!k?.startsWith(PREFIX));
  for (const k of keys) s.removeItem(k);
}

/** The time of day, with the date when it is not today, in the trip's time zone. */
export function stampText(at: string, now: Date, timeZone: string) {
  const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((p) => [p.type, p.value]));
  const a = parts(new Date(at)), n = parts(now);
  const day = a.year === n.year && a.month === n.month && a.day === n.day ? "" : `${Number(a.day)} ${sv.months[Number(a.month) - 1]} `;
  return `${day}${a.hour}.${a.minute}`;
}
/** The banner without a network (PW-04). */
export const offlineText = (at: string | undefined, now: Date, timeZone: string) => (at ? sv.offline.since(stampText(at, now, timeZone)) : sv.offline.title);
/** Offline, the last forecast fetched for the trip, with the time it was fetched (PW-10). */
export function keptForecast<F>(c: Copy | null, tripId: string): { days: Record<string, F>; at: string } | null {
  const f = c?.forecast as { tripId?: string; days?: Record<string, F> } | undefined;
  return f?.tripId === tripId && f.days && c?.forecastAt ? { days: f.days, at: c.forecastAt } : null;
}
