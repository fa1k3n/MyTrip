// Shared costs for Summera. All sums are done in whole öre so balances add up to exactly zero (MI-04).
import type { Op } from "@trip/schema";
import { kr } from "./format.ts";
import { sv } from "./sv.ts";
import { activityEnd, toMin } from "./time.ts";

type Person = { id: string; shares?: boolean };
type ExpenseLike = { amount: number; paidBy: string; sharedBy: string[] };
type PaymentLike = { from: string; to: string; amount: number };
export type Transfer = { from: string; to: string; amount: number };

const ore = (x: number) => Math.round(x * 100);

/** "640,50", "1 200.25" -> number; NaN for anything that is not a positive amount (MI-03). */
export function parseAmount(s: string) {
  const t = s.replace(/[\s ]/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) && Number(t) > 0 ? Number(t) : NaN;
}

/** Those who share an expense shared by all: the travelers who share costs, or everyone if nobody does (MI-38). */
export function defaultSharers(people: Person[]) {
  const on = people.filter((p) => p.shares !== false).map((p) => p.id);
  return on.length ? on : people.map((p) => p.id);
}

/** Exactly those who share by default is stored as [] so that travelers added later share it too (MI-02, MI-38); anything else
 * as the chosen travelers in the order of `all`. */
export const sharedByValue = (selected: string[], defaults: string[], all = defaults) =>
  defaults.length === new Set(selected).size && defaults.every((id) => selected.includes(id)) ? [] : all.filter((id) => selected.includes(id));

/** Who shares an expense, as Pengar says it: "alla" when everyone does, else the names (MI-38). */
export function sharersText(sharedBy: string[], people: Person[], name: (id: string) => string) {
  const ids = sharedBy.length ? sharedBy : defaultSharers(people);
  return ids.length === people.length && !sharedBy.length ? sv.everyone : ids.map(name).join(", ");
}

/** Turning "Delar på kostnader" on or off for a traveler; on is stored as no value (MI-38). */
export function sharesOps(t: { travelers: Person[] }, id: string, on: boolean): Op[] {
  const i = t.travelers.findIndex((p) => p.id === id);
  if (i < 0 || (t.travelers[i].shares !== false) === on) return [];
  return [on ? { op: "remove", path: `travelers/${i}/shares` } : { op: "set", path: `travelers/${i}/shares`, value: false }];
}

/** Positive: the traveler gets money back. Negative: the traveler owes money. */
export function balances(people: Person[], expenses: ExpenseLike[], payments: PaymentLike[]) {
  const b: Record<string, number> = Object.fromEntries(people.map((p) => [p.id, 0]));
  for (const e of expenses) {
    const sharers = e.sharedBy.length ? e.sharedBy : defaultSharers(people); // MI-38
    const total = ore(e.amount), each = Math.floor(total / sharers.length);
    b[e.paidBy] = (b[e.paidBy] ?? 0) + total;
    sharers.forEach((id, i) => { b[id] = (b[id] ?? 0) - each - (i < total - each * sharers.length ? 1 : 0); });
  }
  for (const p of payments) {
    b[p.from] = (b[p.from] ?? 0) + ore(p.amount);
    b[p.to] = (b[p.to] ?? 0) - ore(p.amount);
  }
  return Object.fromEntries(Object.entries(b).map(([id, v]) => [id, v / 100]));
}

/** Largest debtor pays the largest creditor until everyone is even: at most n-1 transfers (MI-05). */
export function settle(bal: Record<string, number>): Transfer[] {
  const left = Object.entries(bal).map(([id, v]) => ({ id, v: ore(v) }));
  const out: Transfer[] = [];
  for (;;) {
    const cred = left.reduce((m, x) => (x.v > m.v ? x : m), { id: "", v: 0 });
    const debt = left.reduce((m, x) => (x.v < m.v ? x : m), { id: "", v: 0 });
    if (!cred.id || !debt.id) return out;
    const amount = Math.min(cred.v, -debt.v);
    cred.v -= amount; debt.v += amount;
    out.push({ from: debt.id, to: cred.id, amount: amount / 100 });
  }
}

export const balanceText = (v: number) =>
  Math.abs(v) < 0.005 ? sv.even : v > 0 ? `${sv.owedBack} ${kr(v)}` : `${sv.owes} ${kr(-v)}`;

export type ExpenseInput = { text: string; amount: string; category: string; paidBy: string; sharedBy: string[]; addedBy: string; activityId?: string;
  dreamId?: string; // the wish it was for (UP-47)
  foreign?: { currency: string; rate: number; rateDate: string }; // `amount` is then in this currency (UP-25)
};

/** A new expense with who added it and when (MI-02, UP-13). `date` is the trip's today, `at` the moment as ISO time. */
/** An amount in another currency as the trip's amount, rounded to öre, with what was entered (UP-25). */
function converted(amount: number, f: ExpenseInput["foreign"]) {
  if (!f) return {};
  return { amount: Math.round(amount * f.rate * 100) / 100, foreign: { amount, currency: f.currency, rate: f.rate, rateDate: f.rateDate } };
}

export function newExpense(t: { travelers: Person[] }, input: ExpenseInput, date: string, at: string, id: string): { ok: true; ops: Op[] } | { ok: false; error: string } {
  const amount = parseAmount(input.amount);
  if (!input.text.trim()) return { ok: false, error: sv.errors.expenseText };
  if (Number.isNaN(amount)) return { ok: false, error: sv.badAmount }; // MI-03
  const sharedBy = sharedByValue(input.sharedBy, defaultSharers(t.travelers), t.travelers.map((x) => x.id)); // MI-38
  return { ok: true, ops: [{ op: "add", path: "expenses/-", value: { id, text: input.text.trim(), category: input.category, amount, paidBy: input.paidBy, sharedBy, date, ...(input.activityId ? { activityId: input.activityId } : {}), ...(input.dreamId ? { dreamId: input.dreamId } : {}), ...converted(amount, input.foreign), addedBy: input.addedBy, addedAt: at } }] };
}

/** An activity's budget category for its expenses (UP-22, MI-30): Resa is Transport, Mat Mat, Shopping Shopping, Klockslag and unknown ones
 * Övrigt, the rest Upplevelse. */
const EXPENSE_CATEGORY: Record<string, string> = { Resa: "Transport", Klockslag: "Övrigt", Mat: "Mat", Shopping: "Shopping", Utsikt: "Upplevelse", Aktivitet: "Upplevelse",
  Avkoppling: "Upplevelse", Museum: "Upplevelse", Bad: "Upplevelse", Natur: "Upplevelse" };

/** The budget category an activity's expenses get (UP-22, UP-43). */
export const activityCategory = (category?: string) => EXPENSE_CATEGORY[category ?? ""] ?? "Övrigt";

/** The short form for an activity: only the amount and an optional description, which falls back to the activity's title (UP-22). */
export function activityExpense(a: { id: string; text: string; category?: string; dreamId?: string }, f: { text: string; amount: string }, payer: string, sharedBy: string[]): ExpenseInput {
  return { text: f.text.trim() || a.text, amount: f.amount, category: activityCategory(a.category), paidBy: payer, sharedBy, addedBy: payer, activityId: a.id,
    ...(a.dreamId ? { dreamId: a.dreamId } : {}) }; // the activity's wish too (UP-47)
}

/** A wish to choose in the sheet, with its first activity on the shown day when it is planned there (UP-47). */
export type WishChoice = { id: string; text: string; category?: string; activityId?: string };

/** The sheet's wishes: those planned on the day through an activity the viewer sees first, then the rest of the trip's (UP-47). */
export function wishChoices(day: { activities: { id: string; dreamId?: string; hidden?: boolean }[] }, dreams: { id: string; title: string; category?: string }[]): WishChoice[] {
  const first = new Map<string, string>();
  for (const a of day.activities) if (a.dreamId && !a.hidden && !first.has(a.dreamId)) first.set(a.dreamId, a.id);
  const choice = (d: (typeof dreams)[number]): WishChoice => ({ id: d.id, text: d.title, ...(d.category ? { category: d.category } : {}), ...(first.has(d.id) ? { activityId: first.get(d.id) } : {}) });
  return [...dreams.filter((d) => first.has(d.id)), ...dreams.filter((d) => !first.has(d.id))].map(choice);
}

/** The wish of the activity UP-43 would guess (UP-47). */
export function guessWish(activities: Parameters<typeof guessActivity>[0], now: string | undefined) {
  const id = guessActivity(activities, now);
  return (activities as { id: string; dreamId?: string }[]).find((a) => a.id === id)?.dreamId;
}

/** The sheet's expense for a chosen wish: its title without a description, the category from the tiles (UP-47). */
export const wishExpense = (w: WishChoice, f: { text: string; amount: string; category: string }, payer: string, sharedBy: string[]): ExpenseInput =>
  ({ text: f.text.trim() || w.text, amount: f.amount, category: f.category, paidBy: payer, sharedBy, addedBy: payer, dreamId: w.id, ...(w.activityId ? { activityId: w.activityId } : {}) });

/** Each traveler's total: the expenses they paid (MI-40). */
export function paidTotals(people: Person[], expenses: { paidBy: string; amount: number }[]) {
  const b: Record<string, number> = Object.fromEntries(people.map((p) => [p.id, 0]));
  for (const e of expenses) b[e.paidBy] = (b[e.paidBy] ?? 0) + ore(e.amount);
  return Object.fromEntries(Object.entries(b).map(([id, v]) => [id, v / 100]));
}

/** Summera's and Uppleva's short form without an activity: the category from the form (MI-13, UP-30). */
export const plainExpense = (f: { text: string; amount: string; category: string }, payer: string, sharedBy: string[]): ExpenseInput =>
  ({ text: f.text.trim(), amount: f.amount, category: f.category, paidBy: payer, sharedBy, addedBy: payer });

/** The title of the activity an expense was for, if it is still in the plan (MI-14). */
export function activityTitle(t: { days: { activities: { id: string; text: string }[] }[] }, e: { activityId?: string }) {
  if (!e.activityId) return undefined;
  for (const d of t.days) for (const a of d.activities) if (a.id === e.activityId) return a.text;
  return undefined;
}

/** Who adds the expense: the traveler remembered on this device if still on the trip, else the first (UP-13). */
export const pickAdder = (travelers: Person[], stored: string | null) =>
  travelers.some((x) => x.id === stored) ? stored! : travelers[0]?.id ?? "";

/** Unhandled expenses wait for a Planerare's approval and are not settled (MI-09, MI-10). */
export const settled = <E extends { pending?: boolean }>(expenses: E[]) => expenses.filter((e) => !e.pending);
export const unhandled = <E extends { pending?: boolean }>(expenses: E[]) => expenses.filter((e) => e.pending);
const at = (t: { expenses: { id: string }[] }, id: string) => t.expenses.findIndex((e) => e.id === id);
/** Approving removes the mark; rejecting removes the expense (MI-11). */
export const approveExpense = (t: { expenses: { id: string }[] }, id: string): Op[] => (at(t, id) < 0 ? [] : [{ op: "remove", path: `expenses/${at(t, id)}/pending` }]);
export const rejectExpense = (t: { expenses: { id: string }[] }, id: string): Op[] => (at(t, id) < 0 ? [] : [{ op: "remove", path: `expenses/${at(t, id)}` }]);
/** Removing a wrong or doubly entered expense (MI-34). */
export const removeExpense = rejectExpense;
/** Removing a wrong payment (MI-35). */
export const removePayment = (t: { payments: { id: string }[] }, id: string): Op[] => {
  const i = t.payments.findIndex((p) => p.id === id);
  return i < 0 ? [] : [{ op: "remove", path: `payments/${i}` }];
};

/** Expenses by date, then by when they were added, never by amount (MI-24). */
export const byDate = <E extends { date?: string; addedAt?: string }>(expenses: E[]) =>
  [...expenses].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.addedAt ?? "").localeCompare(b.addedAt ?? ""));

/** Who shares an expense, in the travelers' order; everyone is stored as shared by all (MI-25, MI-02). */
export function splitOps(t: { travelers: Person[]; expenses: { id: string }[] }, id: string, selected: string[]): { ok: true; ops: Op[] } | { ok: false; error: string } {
  const i = at(t, id);
  if (i < 0) return { ok: false, error: sv.errors.expenseText };
  if (!selected.some((s) => t.travelers.some((x) => x.id === s))) return { ok: false, error: sv.minnas.splitNeeded };
  return { ok: true, ops: [{ op: "set", path: `expenses/${i}/sharedBy`, value: sharedByValue(selected, defaultSharers(t.travelers), t.travelers.map((x) => x.id)) }] };
}

const TILE_SHAPES: Record<string, string> = { Boende: "bed", Transport: "car", Mat: "utensils", Upplevelse: "ferris", Shopping: "bag" };
/** The category tiles of the form for an expense without an activity, Mat chosen at first (UP-42, MI-30). */
export const expenseTiles = () => sv.budgetCategories.map((name) => ({ name, shape: TILE_SHAPES[name] ?? "ellipsis", chosen: name === "Mat" }));

const FORMER = "Mat/Fritid";
/** Ops that convert the former category Mat/Fritid once: an activity's expense becomes Upplevelse or Shopping when its activity leads
 * there, everything else Mat (MI-31). */
export function recategorizeOps(t: { days: { activities: { id: string; category?: string }[] }[]; budget: { category: string }[]; expenses: { category: string; activityId?: string }[] }): Op[] {
  const acts = new Map(t.days.flatMap((d) => d.activities.map((a) => [a.id, a.category ?? ""] as const)));
  const ops: Op[] = [];
  t.budget.forEach((b, i) => { if (b.category === FORMER) ops.push({ op: "set", path: `budget/${i}/category`, value: "Mat" }); });
  t.expenses.forEach((e, i) => {
    if (e.category !== FORMER) return;
    const via = EXPENSE_CATEGORY[acts.get(e.activityId ?? "") ?? ""];
    ops.push({ op: "set", path: `expenses/${i}/category`, value: via === "Upplevelse" || via === "Shopping" ? via : "Mat" });
  });
  return ops;
}

type Planned = { id: string; start?: string; end?: string; durationMin?: number; hidden?: boolean };
/** The activity an expense added now most likely belongs to: the one going on by the plan, else the one that started most recently,
 * less than an hour ago; never a hidden one; none without a clock (another day than today) (UP-43). */
export function guessActivity(list: Planned[], now: string | undefined) {
  if (!now) return undefined;
  const at = toMin(now), started = list.filter((a) => !a.hidden && a.start && toMin(a.start) <= at);
  const going = started.filter((a) => { const end = activityEnd(a); return end && at < toMin(end); });
  const last = (xs: Planned[]) => xs.reduce<Planned | undefined>((b, a) => (!b || toMin(a.start!) >= toMin(b.start!) ? a : b), undefined);
  const recent = last(started);
  return last(going)?.id ?? (recent && at - toMin(recent.start!) < 60 ? recent.id : undefined);
}

type Day = { date: string; activities: (Planned & { text: string; category?: string })[] };
/** The activities an expense can be moved to: those of its day that are not hidden, and its current one (MI-32). */
export function linkChoices(t: { days: Day[] }, e: { date?: string; activityId?: string }) {
  const own = t.days.find((d) => d.date === e.date)?.activities.filter((a) => !a.hidden) ?? [];
  const current = own.some((a) => a.id === e.activityId) ? undefined : t.days.flatMap((d) => d.activities).find((a) => a.id === e.activityId);
  return current ? [...own, current] : own;
}

/** A Planerare and the superuser change every expense's activity, a traveler only their own (MI-32). */
export const mayRelink = (e: { addedBy?: string }, who: { manager: boolean; self?: string }) => who.manager || (!!who.self && e.addedBy === who.self);
export const mayRemove = (who: { manager: boolean }) => who.manager; // MI-34: travelers may not remove expenses (AU-13)

/** Moving an expense to another activity, or none, with the category confirmed in the same step (MI-32). */
export function relinkOps(t: { days: Day[]; expenses: { id: string; activityId?: string; category: string }[] }, id: string, activityId: string, category: string): { ok: true; ops: Op[] } | { ok: false; error: string } {
  const i = t.expenses.findIndex((e) => e.id === id), e = t.expenses[i];
  if (!e || (activityId && !t.days.some((d) => d.activities.some((a) => a.id === activityId)))) return { ok: false, error: sv.minnas.relinkGone };
  const ops: Op[] = [];
  if ((e.activityId ?? "") !== activityId) ops.push(activityId ? { op: "set", path: `expenses/${i}/activityId`, value: activityId } : { op: "remove", path: `expenses/${i}/activityId` });
  if (e.category !== category) ops.push({ op: "set", path: `expenses/${i}/category`, value: category });
  return { ok: true, ops };
}
