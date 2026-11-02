// What the phone keeps for working offline: the last fetched trip per link (PW-03, PW-05, PW-17). Pure, so it runs under node --test.
import { sv } from "./sv.ts";
import { tripOfLink } from "./access.ts";
import type { Op } from "@trip/schema";

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
export const dropCopy = (s: Store, link: string) => { s.removeItem(PREFIX + link); s.removeItem(QUEUE + link); s.removeItem(VERDICTS_KEY + link); }; // UP-53: its verdicts too
/** #admin removes every link and so every copy and queue (PW-17), but not the account's (PW-22). */
export function dropAllCopies(s: Store) {
  const keys = Array.from({ length: s.length }, (_, i) => s.key(i))
    .filter((k): k is string => !!k && [PREFIX, QUEUE, VERDICTS_KEY].some((p) => k.startsWith(p) && !k.startsWith(p + "@")));
  for (const k of keys) s.removeItem(k);
}

/** An account keeps its copy and queue under its id, marked so that it can never be a link key (PW-22). */
export const accountSlot = (id: string) => `@${id}`;
const ACCOUNT = "mytrip.account";
/** The account that last logged in on the phone, whose copy a start without a network reads (PW-22). */
export const storedAccount = (s: Store) => s.getItem(ACCOUNT);
/** An account logged in: another account's copy and queue leave the phone (PW-22). */
export function keepAccount(s: Store, id: string) {
  const old = s.getItem(ACCOUNT);
  if (old && old !== id) dropCopy(s, accountSlot(old));
  try { s.setItem(ACCOUNT, id); } catch { /* storage blocked: online only */ }
}
/** Logging out removes the account's copy and queue from the phone (PW-23). */
export function forgetAccount(s: Store) {
  const old = s.getItem(ACCOUNT);
  if (old) dropCopy(s, accountSlot(old));
  s.removeItem(ACCOUNT);
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

/** An expense on the phone that the server does not have yet (PW-06), or that it rejected, with the reason (PW-09). An account's
 * keeps its trip; a link's goes to the link's trip (PW-22). */
export type Expense = { id: string; amount: number; [k: string]: unknown };
export type Waiting = { expense: Expense; state: "waiting" | "failed"; reason?: string; tripId?: string; home?: string }; // home: the trip's currency, to convert to (UP-49)

type Foreign = { amount: number; currency: string; rate?: number; rateDate?: string };
/** An expense in another currency still without a rate: it waits for one before it is sent (UP-49). */
export const unrated = (e: Expense) => { const f = e.foreign as Foreign | undefined; return !!f && !f.rate; };
/** The expense converted with the rate of its date, as the form does with a network (UP-25, UP-49). */
export function withRate(e: Expense, r: { rate: number; date: string }): Expense {
  const f = e.foreign as Foreign;
  return { ...e, amount: Math.round(f.amount * r.rate * 100) / 100, foreign: { amount: f.amount, currency: f.currency, rate: r.rate, rateDate: r.date } };
}
/** A read that failed for want of a network or of a working server uses the copy on the phone; a refusal does not (PW-26). */
export function useCopy(x: unknown) {
  const status = x instanceof Error && typeof (x as { status?: unknown }).status === "number" ? (x as unknown as { status: number }).status : undefined;
  return status === undefined || status >= 500;
}
/** What sending one expense gave: recorded, not now (try later, with why: PW-18), or rejected with a reason. */
export type Sent = { ok: true } | { offline: true; why?: string } | { failed: string };

/** A failed send: no contact, a conflict or a server error waits and says why (PW-18); any other answer rejects it (PW-09). */
export function sendError(x: unknown): Sent {
  const status = x instanceof Error && typeof (x as { status?: unknown }).status === "number" ? (x as unknown as { status: number }).status : undefined;
  if (status === undefined) return { offline: true, why: sv.queue.noContact };
  if (status === 409 || status >= 500) return { offline: true, why: sv.queue.server(status) };
  const problems = (x as unknown as { problems?: string[] }).problems ?? [];
  return { failed: status === 403 ? sv.queue.forbidden : problems.join(" ") || sv.queue.rejected(status) };
}

const QUEUE = "mytrip.queue.";
export function loadQueue(s: Store, link: string): Waiting[] {
  try { return (JSON.parse(s.getItem(QUEUE + link) ?? "[]") as Waiting[]) ?? []; } catch { return []; }
}
export function saveQueue(s: Store, link: string, q: Waiting[]) {
  try { if (q.length) s.setItem(QUEUE + link, JSON.stringify(q)); else s.removeItem(QUEUE + link); } catch { /* storage blocked */ }
}
export const enqueue = (q: Waiting[], expense: Expense, tripId?: string, home?: string): Waiting[] =>
  [...q, { expense, state: "waiting", ...(tripId ? { tripId } : {}), ...(home ? { home } : {}) }];
export const retry = (q: Waiting[], id: string): Waiting[] =>
  q.map((x) => (x.expense.id === id ? { expense: x.expense, state: "waiting", ...(x.tripId ? { tripId: x.tripId } : {}), ...(x.home ? { home: x.home } : {}) } : x));
export const dequeue = (q: Waiting[], id: string) => q.filter((x) => x.expense.id !== id);
export const unsent = (q: Waiting[]) => q.length;

/** The waiting expenses of one trip: an account's carry their trip, a link's belong to its only trip (PW-22). */
export const waitingFor = (q: Waiting[], tripId: string | undefined) => q.filter((x) => !x.tripId || x.tripId === tripId);
/** The trip with the expenses still on the phone, marked, so the budget status counts them (PW-06). */
export function withWaiting<T extends { id?: string; expenses: Expense[] }>(t: T, q: Waiting[]): Omit<T, "expenses"> & { expenses: (T["expenses"][number] & { waiting?: Waiting["state"] })[] } {
  const extra = waitingFor(q, t.id).filter((x) => !unrated(x.expense) && !t.expenses.some((e) => e.id === x.expense.id)) /* no rate, no amount to count (UP-49) */.map((x) => ({ ...x.expense, waiting: x.state }));
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
    if ("offline" in r) { stop = true; out.push(r.why ? { ...x, reason: r.why } : x); } else if ("failed" in r) out.push({ ...x, state: "failed", reason: r.failed });
  }
  return out;
}

/** Runs `fn` one at a time: a call while it runs waits and runs it once more after, however many calls came meanwhile (PW-19). */
export function serial(fn: () => Promise<boolean>) {
  let running: Promise<boolean> | null = null, again: Promise<boolean> | null = null;
  const start = (): Promise<boolean> => (running = fn().finally(() => { running = null; }));
  return (): Promise<boolean> => {
    if (!running) return start();
    return (again ??= running.catch(() => false).then(() => { again = null; return start(); }));
  };
}

/** A signal that aborts after `ms`, built by hand: older Safari has no AbortSignal.timeout (PW-19). */
export function timeoutSignal(ms: number, later: (f: () => void, ms: number) => unknown = setTimeout) {
  const c = new AbortController();
  later(() => c.abort(), ms);
  return c.signal;
}

/** The reason with the time it was tried, as the row shows it (PW-19). */
export const triedAt = (why: string, at: Date) =>
  sv.queue.tried(why, `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`);

/** The trip to send the waiting expenses to: the login's, or else the link's they were added with, as when the phone is also
 * logged in as admin (PW-20). Nothing before the login is known. */
export const sendTrip = (me: { role: string; tripId?: string } | null | undefined, key: string | null) =>
  !me ? undefined : me.tripId ?? (key ? tripOfLink(key) : undefined);

/** A verdict given without a network: the traveler's chosen verdict on a wish, or none when taken back (UP-53). */
export type WaitingVerdict = { tripId: string; dreamId: string; by: string; verdict: "again" | "ok" | "never" | null };
type Mem = { id: string; dreamId: string; by: string; verdict?: "again" | "ok" | "never"; note?: string };
const same = (a: WaitingVerdict, b: WaitingVerdict) => a.tripId === b.tripId && a.dreamId === b.dreamId && a.by === b.by;
/** The latest verdict replaces a waiting one on the same wish by the same traveler (UP-53). */
export const queueVerdict = (q: WaitingVerdict[], v: WaitingVerdict) => [...q.filter((x) => !same(x, v)), v];
/** The memory as it becomes with the verdict, its comment kept; null when nothing is left of it. */
const memoryWith = (was: Mem | undefined, v: WaitingVerdict): Mem | null =>
  !v.verdict && !was?.note ? null : { id: was?.id ?? `m-${v.dreamId}-${v.by}`, dreamId: v.dreamId, by: v.by, ...(v.verdict ? { verdict: v.verdict } : {}), ...(was?.note ? { note: was.note } : {}) };
/** The change from the latest trip to the waiting verdict; none when the trip already has it (UP-53). */
export function verdictOps(t: { memories: Mem[] }, v: WaitingVerdict): Op[] {
  const i = t.memories.findIndex((m) => m.dreamId === v.dreamId && m.by === v.by), was = t.memories[i], next = memoryWith(was, v);
  if (!next) return was ? [{ op: "remove", path: `memories/${i}` }] : [];
  if (was && was.verdict === next.verdict) return [];
  return [was ? { op: "set", path: `memories/${i}`, value: next } : { op: "add", path: "memories/-", value: next }];
}
/** The trip shown with its waiting verdicts, so the buttons and counts show them at once (UP-53). */
export function withVerdicts<T extends { id?: string; memories: Mem[] }>(t: T, q: WaitingVerdict[]): T {
  let memories = t.memories;
  for (const v of q.filter((x) => x.tripId === t.id)) {
    const was = memories.find((m) => m.dreamId === v.dreamId && m.by === v.by), next = memoryWith(was, v);
    memories = next ? (was ? memories.map((m) => (m === was ? next : m)) : [...memories, next]) : memories.filter((m) => m !== was);
  }
  return memories === t.memories ? t : { ...t, memories };
}
const VERDICTS_KEY = "mytrip.verdicts.";
export function loadVerdicts(s: Store, slot: string): WaitingVerdict[] {
  try { return (JSON.parse(s.getItem(VERDICTS_KEY + slot) ?? "[]") as WaitingVerdict[]) ?? []; } catch { return []; }
}
export function saveVerdicts(s: Store, slot: string, q: WaitingVerdict[]) {
  try { if (q.length) s.setItem(VERDICTS_KEY + slot, JSON.stringify(q)); else s.removeItem(VERDICTS_KEY + slot); } catch { /* storage blocked */ }
}
