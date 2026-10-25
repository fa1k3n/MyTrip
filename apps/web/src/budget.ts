// Budget display: amounts in their own currency, paid items with a subtotal per currency (BG-03..BG-08).
import { sv } from "./sv.ts";

type Item = { amount?: number; amountMax?: number; estimate?: boolean; currency?: string; paid: boolean };
const symbols: Record<string, string> = { SEK: "kr", EUR: "€", USD: "$", GBP: "£" };

const num = (n: number) => n.toLocaleString("sv-SE", Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number, currency: string) => `${num(n)} ${symbols[currency] ?? currency}`;

export function amountText(i: Item, tripCurrency: string) {
  if (i.amount === undefined) return sv.notChecked;
  const cur = i.currency ?? tripCurrency;
  const text = i.amountMax !== undefined ? `${num(i.amount)}–${money(i.amountMax, cur)}` : money(i.amount, cur);
  return i.estimate ? `ca ${text}` : text;
}

/** Paid items with known amounts, their subtotal per currency, and everything else (estimates, unpaid, unknown). */
export function budgetRows<T extends Item>(items: T[], tripCurrency: string) {
  const isPaid = (i: T) => i.paid && !i.estimate && i.amount !== undefined;
  const paid = items.filter(isPaid), sums = new Map<string, number>();
  for (const i of paid) {
    const c = i.currency ?? tripCurrency;
    sums.set(c, (sums.get(c) ?? 0) + Math.round(i.amount! * 100));
  }
  return { paid, totals: [...sums].map(([currency, s]) => ({ currency, sum: s / 100 })), other: items.filter((i) => !isPaid(i)) };
}

type LimitTrip = { currency: string; budgetMax?: number; budget: { amount?: number; currency?: string }[]; expenses: { amount: number }[] };

/** Planned budget in the trip's currency plus expenses, against the maximum budget: warning from 80 %, over above 100 % (BG-13). */
export function budgetLimit(t: LimitTrip) {
  if (!t.budgetMax) return null;
  const cents = (n: number) => Math.round(n * 100);
  const planned = t.budget.filter((i) => !i.currency || i.currency === t.currency).reduce((a, i) => a + cents(i.amount ?? 0), 0);
  const used = planned + t.expenses.reduce((a, e) => a + cents(e.amount), 0), max = cents(t.budgetMax);
  const level: "ok" | "near" | "over" = used > max ? "over" : used * 5 >= max * 4 ? "near" : "ok";
  return { used: used / 100, max: max / 100, percent: Math.round((used / max) * 100), left: (max - used) / 100, level };
}

type Slice = { label: string; value: number; kind: "cat" | "spent" | "unused" };

/** The donut: planned budget per category in the trip's currency (BG-09); with a maximum also the expenses and the unused part (BG-14). */
export function donutSlices(t: LimitTrip & { budget: { category: string }[] }) {
  const cents = (n: number) => Math.round(n * 100);
  const cats = new Map<string, number>();
  for (const i of t.budget) if (i.amount !== undefined && (!i.currency || i.currency === t.currency)) cats.set(i.category, (cats.get(i.category) ?? 0) + cents(i.amount));
  const slices: Slice[] = [...cats].map(([label, v]) => ({ label, value: v, kind: "cat" }));
  const planned = [...cats.values()].reduce((a, v) => a + v, 0);
  let used = planned;
  if (t.budgetMax) {
    const spent = t.expenses.reduce((a, e) => a + cents(e.amount), 0), max = cents(t.budgetMax);
    used += spent;
    if (spent > 0) slices.push({ label: sv.spentOnTrip, value: spent, kind: "spent" });
    if (max > used) slices.push({ label: sv.unused, value: max - used, kind: "unused" });
  }
  return {
    slices: slices.map((x) => ({ ...x, value: x.value / 100 })),
    total: slices.reduce((a, x) => a + x.value, 0) / 100, used: used / 100, max: t.budgetMax,
  };
}
