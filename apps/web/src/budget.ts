// Budget display: amounts in their own currency (BG-06, BG-07), and plan, utfall and prognos per category (BG-15..BG-19).
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

type Slice = { label: string; value: number; kind: "cat" | "unused" };

type PlanTrip = {
  currency: string; budgetMax?: number;
  budget: { category: string; amount?: number; amountMax?: number; estimate?: boolean; currency?: string; paid: boolean }[];
  expenses: { category: string; amount: number }[];
};
export type PlanRow = { category: string; planned: number; actual: number; forecast: number; spent: number; over: boolean };

/** Plan, utfall (paid in advance plus expenses) and prognos per category and in total, in the trip's currency (BG-15), in the order
 * of MI-30 and then the trip's own (BG-16), against the maximum budget (BG-19). `used`: only categories with an amount (Uppleva, Minnas). */
export function budgetPlan(t: PlanTrip, used = false) {
  const cents = (n: number) => Math.round(n * 100);
  const rows = new Map<string, { planned: number; actual: number; spent: number }>();
  for (const c of sv.budgetCategories) rows.set(c, { planned: 0, actual: 0, spent: 0 });
  const seen = new Set<string>();
  const row = (c: string) => (seen.add(c), rows.get(c) ?? rows.set(c, { planned: 0, actual: 0, spent: 0 }).get(c)!);
  for (const i of t.budget) {
    const r = row(i.category || sv.hiddenText); // a hidden budget item reaches the viewer without its category (AU-30)
    if (i.currency && i.currency !== t.currency) continue; // listed, not counted (BG-07)
    r.planned += cents(i.amountMax ?? i.amount ?? 0);
    if (i.paid && !i.estimate && i.amount !== undefined) r.actual += cents(i.amount);
  }
  for (const e of t.expenses) {
    const r = row(e.category || sv.hiddenText);
    r.actual += cents(e.amount); r.spent += cents(e.amount);
  }
  const six = new Set<string>(sv.budgetCategories); // always shown (BG-16)
  const list: PlanRow[] = [...rows].filter(([c, r]) => six.has(c) || (seen.has(c) && (!used || r.planned > 0 || r.actual > 0))).map(([category, r]) => ({
    category, planned: r.planned / 100, actual: r.actual / 100, forecast: Math.max(r.planned, r.actual) / 100, spent: r.spent / 100, over: r.actual > r.planned,
  }));
  const sum = (k: "planned" | "actual" | "forecast") => [...rows].filter(([c]) => seen.has(c)).reduce((a, [, r]) => a + (k === "forecast" ? Math.max(r.planned, r.actual) : r[k]), 0);
  const forecast = sum("forecast"), max = t.budgetMax ? cents(t.budgetMax) : undefined;
  const level: "ok" | "near" | "over" = max === undefined ? "ok" : forecast > max ? "over" : forecast * 5 >= max * 4 ? "near" : "ok";
  return {
    rows: list, planned: sum("planned") / 100, actual: sum("actual") / 100, forecast: forecast / 100, level,
    ...(max !== undefined && { max: max / 100, left: (max - forecast) / 100, percent: Math.round((forecast / max) * 100) }),
  };
}
export type BudgetPlan = ReturnType<typeof budgetPlan>;

/** The donut: the prognos per category, with a maximum also the unused part; the centre shows the prognos (BG-18). */
export function planSlices(p: BudgetPlan) {
  const slices: Slice[] = p.rows.filter((r) => r.forecast > 0).map((r) => ({ label: r.category, value: r.forecast, kind: "cat" }));
  if (p.max !== undefined && p.left! > 0) slices.push({ label: sv.unused, value: p.left!, kind: "unused" });
  return { slices, total: Math.round(slices.reduce((a, x) => a + x.value * 100, 0)) / 100, sum: p.forecast, max: p.max };
}
type DayTrip = {
  days: { id: string; date: string; activities: { id: string; dreamId?: string }[] }[]; dreams: { id: string; title: string }[];
  expenses: { amount: number; activityId?: string; dreamId?: string; date?: string }[];
};
export type WishRow = { title: string; dreamId?: string; sum: number };
export type DayGroup = { date?: string; sum: number; rows: WishRow[] };

/** The expenses per day and wish: the wish chosen, else the activity's; the day of the activity, else the expense's date (BG-22). */
export function byDay(t: DayTrip): DayGroup[] {
  const cents = (n: number) => Math.round(n * 100);
  const where = new Map(t.days.flatMap((d) => d.activities.map((a) => [a.id, { date: d.date, dreamId: a.dreamId }] as const)));
  const groups = new Map<string, { date?: string; wishes: Map<string, number>; none: number }>();
  for (const e of t.expenses) {
    const at = e.activityId ? where.get(e.activityId) : undefined, date = at?.date ?? e.date, wish = e.dreamId ?? at?.dreamId;
    const g = groups.get(date ?? "") ?? groups.set(date ?? "", { date, wishes: new Map(), none: 0 }).get(date ?? "")!;
    if (wish && t.dreams.some((d) => d.id === wish)) g.wishes.set(wish, (g.wishes.get(wish) ?? 0) + cents(e.amount));
    else g.none += cents(e.amount);
  }
  return [...groups.values()].sort((a, b) => (a.date ? (b.date ? a.date.localeCompare(b.date) : -1) : 1)).map((g) => {
    const rows: WishRow[] = t.dreams.filter((d) => g.wishes.has(d.id)).map((d) => ({ title: d.title, dreamId: d.id, sum: g.wishes.get(d.id)! / 100 }));
    if (g.none) rows.push({ title: g.date ? sv.plan.noWish : sv.plan.noDate, sum: g.none / 100 });
    return { ...(g.date ? { date: g.date } : {}), sum: rows.reduce((s, r) => s + cents(r.sum), 0) / 100, rows };
  });
}
