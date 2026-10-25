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
/** A link leaves the phone with its copy and its waiting expenses (PW-17). */
export const dropCopy = (s: Store, link: string) => { s.removeItem(PREFIX + link); s.removeItem(QUEUE + link); };
/** #admin removes every link and so every copy and queue (PW-17). */
export function dropAllCopies(s: Store) {
  const keys = Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => !!k && (k.startsWith(PREFIX) || k.startsWith(QUEUE)));
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

/** An expense on the phone that the server does not have yet (PW-06), or that it rejected, with the reason (PW-09). */
export type Expense = { id: string; amount: number; [k: string]: unknown };
export type Waiting = { expense: Expense; state: "waiting" | "failed"; reason?: string };
/** What sending one expense gave: recorded, no network (try later), or rejected with a reason. */
export type Sent = { ok: true } | { offline: true } | { failed: string };

const QUEUE = "mytrip.queue.";
export function loadQueue(s: Store, link: string): Waiting[] {
  try { return (JSON.parse(s.getItem(QUEUE + link) ?? "[]") as Waiting[]) ?? []; } catch { return []; }
}
export function saveQueue(s: Store, link: string, q: Waiting[]) {
  try { if (q.length) s.setItem(QUEUE + link, JSON.stringify(q)); else s.removeItem(QUEUE + link); } catch { /* storage blocked */ }
}
export const enqueue = (q: Waiting[], expense: Expense): Waiting[] => [...q, { expense, state: "waiting" }];
export const retry = (q: Waiting[], id: string): Waiting[] => q.map((x) => (x.expense.id === id ? { expense: x.expense, state: "waiting" } : x));
export const dequeue = (q: Waiting[], id: string) => q.filter((x) => x.expense.id !== id);
export const unsent = (q: Waiting[]) => q.length;

/** The trip with the expenses still on the phone, marked, so the budget status counts them (PW-06). */
export function withWaiting<T extends { expenses: Expense[] }>(t: T, q: Waiting[]): Omit<T, "expenses"> & { expenses: (T["expenses"][number] & { waiting?: Waiting["state"] })[] } {
  const extra = q.filter((x) => !t.expenses.some((e) => e.id === x.expense.id)).map((x) => ({ ...x.expense, waiting: x.state }));
  return { ...t, expenses: [...t.expenses, ...extra] };
}

/** Sends the waiting expenses in the order they were added; without a network the rest waits, and a rejected one stays with
 * its reason while the next ones are still sent (PW-07, PW-09). A failed one waits for the user to try again. */
export async function flush(q: Waiting[], send: (e: Expense) => Promise<Sent>): Promise<Waiting[]> {
  const out: Waiting[] = [];
  let stop = false;
  for (const x of q) {
    if (stop || x.state === "failed") { out.push(x); continue; }
    const r = await send(x.expense);
    if ("offline" in r) { stop = true; out.push(x); } else if ("failed" in r) out.push({ ...x, state: "failed", reason: r.failed });
  }
  return out;
}
