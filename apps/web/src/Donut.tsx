// The budget card of Nåla and Minnas (BG-17): the donut (BG-18) with its legend, the totals and the expenses per activity (BG-21);
// Uppleva's donut (UP-45); and the maximum budget warning (BG-19).
import type { ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { dayLabel, donutTotalSize, kr } from "./format.ts";
import { budgetPlan, byActivity, money, planSlices, type BudgetPlan } from "./budget.ts";
import { Icon } from "./Icons.tsx";
import { sv } from "./sv.ts";

const COL: Record<string, string> = { Transport: "#C87A53", Boende: "#7A9A82", Mat: "#D9B26F", Upplevelse: "#5E8C8A", Shopping: "#B9867C", "Mat/Fritid": "#D9B26F", "Övrigt": "#8C7F73" }; // MI-30
const UNUSED = "var(--line)";
const colour = (label: string) => COL[label] ?? COL["Övrigt"];
const whole = (n: number) => kr(Math.round(n)); // an overview: whole kronor keep the rows on one line on a phone

function Donut({ p }: { p: BudgetPlan }) {
  const d = planSlices(p);
  const r = 40, c = 2 * Math.PI * r;
  const sum = whole(d.sum);
  let off = 0;
  return (
    <svg viewBox="0 0 120 120" width="120" role="img" aria-label={sv.budgetChart}>
      {d.slices.map((x) => {
        const l = (x.value / (d.total || 1)) * c, o = off;
        off += l;
        return <circle key={x.label} r={r} cx="60" cy="60" fill="none" stroke={x.kind === "unused" ? UNUSED : colour(x.label)} strokeWidth="18" strokeDasharray={`${l} ${c - l}`} strokeDashoffset={-o} transform="rotate(-90 60 60)" />;
      })}
      {!d.slices.length && <circle r={r} cx="60" cy="60" fill="none" stroke={UNUSED} strokeWidth="18" />}
      <text x="60" y="58" textAnchor="middle" fontSize={donutTotalSize(sum)} fontWeight="700" fill="currentColor">{sum}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="7" fill="currentColor">{d.max ? `${sv.of} ${whole(d.max)}` : sv.total}</text>
    </svg>
  );
}

/** Which colour is which category, and "Oanvänt" with a maximum; with `amounts` each one's prognos in kronor (BG-17, UP-45). */
function Legend({ p, amounts }: { p: BudgetPlan; amounts?: boolean }) {
  const unused = planSlices(p).slices.filter((x) => x.kind === "unused");
  return <ul className={`blegend ${amounts ? "sums" : ""}`}>{[...p.rows.map((r) => ({ label: r.category, kind: "cat", value: r.forecast })), ...unused].map((x) => (
    <li key={x.label}><i className={x.kind} style={{ background: x.kind === "unused" ? UNUSED : colour(x.label) }}></i>{x.label}{amounts && <span>{whole(x.value)}</span>}</li>))}</ul>;
}

/** The expenses per day, each day opening to its activities (BG-21). */
function PerActivity({ t }: { t: Trip }) {
  const groups = byActivity(t);
  if (!groups.length) return null;
  return <div className="bacts"><h4>{sv.plan.byActivity}</h4>{groups.map((g) => (
    <details className="bcat" key={g.date ?? ""}>
      <summary><span className="bline"><span>{g.date ? dayLabel(g.date) : sv.plan.noDate}</span><span>{kr(g.sum)}</span></span></summary>
      {g.rows.map((r) => <div className="row" key={r.activityId ?? r.title}>
        <span>{r.hidden ? <span className="hiddenact"><Icon name="eyeoff" />{sv.hiddenText}</span> : r.title}</span><span>{kr(r.sum)}</span></div>)}
    </details>))}</div>;
}

/** The card's body: donut and legend, the totals, the expenses per activity, then `children` (Nåla's budget items, BG-20). */
export function BudgetPlanView({ t, children }: { t: Trip; children?: ReactNode }) {
  const p = budgetPlan(t, !children);
  const total = (label: string, value: string) => <div><dt>{label}</dt><dd>{value}</dd></div>;
  return (
    <div className="bplan">
      <div className="donutbox"><Donut p={p} /><Legend p={p} amounts /></div>
      <dl className="btot">
        {total(sv.plan.planned, whole(p.planned))}
        {total(sv.plan.actual, whole(p.actual))}
        {p.forecast !== p.planned && total(sv.plan.forecast, whole(p.forecast))}
        {p.max !== undefined && <>
          {total(sv.plan.max, whole(p.max))}
          {p.left! >= 0 ? total(sv.plan.left, whole(p.left!)) : total(sv.plan.over, whole(-p.left!))}
        </>}
      </dl>
      <PerActivity t={t} />
      {children}
    </div>
  );
}

/** Uppleva's budget: only the donut and which colour is which category, no amounts or lists (UP-45). */
export function BudgetDonut({ t }: { t: Trip }) {
  const p = budgetPlan(t, true);
  return <div className="donutbox"><Donut p={p} /><Legend p={p} /></div>;
}

/** The card's tint: light yellow from 80 % of the maximum budget (caution), light red above it (warn) (BG-19). */
export const limitClass = (t: Trip) => ({ ok: "", near: "caution", over: "warn" })[budgetPlan(t).level];

/** A warning triangle from 80 % of the maximum budget, yellow when near and red when over, with the amounts as its name and tooltip (BG-19). */
export function LimitIcon({ t, big }: { t: Trip; big?: boolean }) {
  const l = budgetPlan(t);
  if (l.level === "ok") return null;
  const m = (n: number) => money(n, t.currency);
  const text = l.level === "over" ? sv.limit.over(m(-l.left!), m(l.forecast), m(l.max!)) : sv.limit.near(m(l.forecast), m(l.max!), l.percent!, m(l.left!));
  return <span className={`limiticon ${l.level} ${big ? "big" : ""}`} role="img" aria-label={text} title={text}><Icon name="alert" /></span>;
}
