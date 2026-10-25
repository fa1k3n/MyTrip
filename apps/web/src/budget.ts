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
