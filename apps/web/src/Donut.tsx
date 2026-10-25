// Budget donut and the maximum budget warning, shared by Nåla (BG-09, BG-13, BG-14) and Uppleva (UP-10).
import type { Trip } from "@trip/schema";
import { donutTotalSize, kr } from "./format.ts";
import { budgetLimit, donutSlices, money } from "./budget.ts";
import { Icon } from "./Icons.tsx";
import { sv } from "./sv.ts";

const COL: Record<string, string> = { Transport: "#C87A53", Boende: "#7A9A82", "Mat/Fritid": "#D9B26F", "Övrigt": "#8C7F73" };
const SPENT = "#8E6C8A", UNUSED = "var(--line)";

export function Donut({ t }: { t: Trip }) {
  const d = donutSlices(t);
  const colour = (x: (typeof d.slices)[number]) => (x.kind === "spent" ? SPENT : x.kind === "unused" ? UNUSED : COL[x.label] ?? COL["Övrigt"]);
  const r = 40, c = 2 * Math.PI * r;
  const sum = kr(d.max ? d.used : d.total);
  let off = 0;
  return (
    <div className="donutbox">
      <svg viewBox="0 0 120 120" width="150" role="img" aria-label={sv.budgetChart}>
        {d.slices.map((x) => {
          const l = (x.value / (d.total || 1)) * c, o = off;
          off += l;
          return <circle key={x.label} r={r} cx="60" cy="60" fill="none" stroke={colour(x)} strokeWidth="18" strokeDasharray={`${l} ${c - l}`} strokeDashoffset={-o} transform="rotate(-90 60 60)" />;
        })}
        <text x="60" y="58" textAnchor="middle" fontSize={donutTotalSize(sum)} fontWeight="700" fill="currentColor">{sum}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="7" fill="currentColor">{d.max ? `${sv.of} ${kr(d.max)}` : sv.total}</text>
      </svg>
      <div className="legend">{d.slices.map((x) => <div key={x.label}><i className={x.kind} style={{ background: colour(x) }}></i>{x.label} {kr(x.value)}</div>)}</div>
    </div>
  );
}

/** The card's tint: light yellow from 80 % of the maximum budget (caution), light red above it (warn) (BG-13). */
export const limitClass = (t: Trip) => ({ ok: "", near: "caution", over: "warn" })[budgetLimit(t)?.level ?? "ok"];

/** A warning triangle from 80 % of the maximum budget, yellow when near and red when over, with the amounts as its name and tooltip (BG-13). */
export function LimitIcon({ t, big }: { t: Trip; big?: boolean }) {
  const l = budgetLimit(t);
  if (!l || l.level === "ok") return null;
  const m = (n: number) => money(n, t.currency);
  const text = l.level === "over" ? sv.limit.over(m(-l.left), m(l.used), m(l.max)) : sv.limit.near(m(l.used), m(l.max), l.percent, m(l.left));
  return <span className={`limiticon ${l.level} ${big ? "big" : ""}`} role="img" aria-label={text} title={text}><Icon name="alert" /></span>;
}
