// Shared costs for Summera. All sums are done in whole öre so balances add up to exactly zero (MI-04).
import type { Op } from "@trip/schema";
import { kr } from "./format.ts";
import { sv } from "./sv.ts";

type Person = { id: string };
type ExpenseLike = { amount: number; paidBy: string; sharedBy: string[] };
type PaymentLike = { from: string; to: string; amount: number };
export type Transfer = { from: string; to: string; amount: number };

const ore = (x: number) => Math.round(x * 100);

/** "640,50", "1 200.25" -> number; NaN for anything that is not a positive amount (MI-03). */
export function parseAmount(s: string) {
  const t = s.replace(/[\s ]/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) && Number(t) > 0 ? Number(t) : NaN;
}

/** Everyone selected is stored as [] so that travelers added later share it too (MI-02). */
export const sharedByValue = (selected: string[], all: string[]) =>
  all.every((id) => selected.includes(id)) ? [] : all.filter((id) => selected.includes(id));

/** Positive: the traveler gets money back. Negative: the traveler owes money. */
export function balances(people: Person[], expenses: ExpenseLike[], payments: PaymentLike[]) {
  const b: Record<string, number> = Object.fromEntries(people.map((p) => [p.id, 0]));
  for (const e of expenses) {
    const sharers = e.sharedBy.length ? e.sharedBy : people.map((p) => p.id);
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

/** Planned budget against actual expenses per category, in first-seen order (MI-07). */
export function budgetVsActual(budget: { category: string; amount?: number; paid?: boolean }[], expenses: { category: string; amount: number }[]) {
  const rows = new Map<string, { category: string; planned: number; actual: number; over: boolean }>();
  const row = (c: string) => rows.get(c) ?? rows.set(c, { category: c, planned: 0, actual: 0, over: false }).get(c)!;
  for (const b of budget) row(b.category).planned += ore(b.amount ?? 0);
  for (const e of expenses) row(e.category).actual += ore(e.amount);
  return [...rows.values()].map((r) => ({ ...r, planned: r.planned / 100, actual: r.actual / 100, over: r.actual > r.planned }));
}

export const balanceText = (v: number) =>
  Math.abs(v) < 0.005 ? sv.even : v > 0 ? `${sv.owedBack} ${kr(v)}` : `${sv.owes} ${kr(-v)}`;

export type ExpenseInput = { text: string; amount: string; category: string; paidBy: string; sharedBy: string[]; addedBy: string };

/** A new expense with who added it and when (MI-02, UP-13). `date` is the trip's today, `at` the moment as ISO time. */
export function newExpense(t: { travelers: Person[] }, input: ExpenseInput, date: string, at: string, id: string): { ok: true; ops: Op[] } | { ok: false; error: string } {
  const amount = parseAmount(input.amount);
  if (!input.text.trim()) return { ok: false, error: sv.errors.expenseText };
  if (Number.isNaN(amount)) return { ok: false, error: sv.badAmount }; // MI-03
  const sharedBy = sharedByValue(input.sharedBy, t.travelers.map((x) => x.id));
  return { ok: true, ops: [{ op: "add", path: "expenses/-", value: { id, text: input.text.trim(), category: input.category, amount, paidBy: input.paidBy, sharedBy, date, addedBy: input.addedBy, addedAt: at } }] };
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
