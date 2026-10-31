// Minnas: Minnen (verdicts on the wishes that came true, MI-15..MI-20, MI-26) and Budget: shared costs, payments and the follow-up (MI-01..MI-14,
// MI-23..MI-25), with unhandled expenses to approve (MI-09..MI-11).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { kr, shortDate } from "./format.ts";
import { approveExpense, balanceText, balances, budgetVsActual, byDate, outcome, rejectExpense, settle, settled, unhandled, type Transfer, activityTitle } from "./money.ts";
import { experienced, memoryOps, mineOf, notesOf, verdictCounts, VERDICTS, type MinnasView } from "./memories.ts";
import { DreamCard } from "./Dreams.tsx";
import { IconButton, Icon } from "./Icons.tsx";
import type { Level } from "@trip/schema/src/rules.ts";
import { sv } from "./sv.ts";
import { expenseAmountText } from "./currency.ts"; // UP-26
import { HiddenText, TextEye, type Run } from "./TripView.tsx";
import type { EditDlg } from "./editKinds.ts";

type Props = {
  t: Trip; addExpense: () => void; addPayment: (prefill?: Transfer) => void; addPerson: () => void;
  expenses: Level; budget: Level; memories: Level; people: boolean; canAdd: boolean; // what the role may see and change (AU-21, MI-21)
  approver: boolean; run: Run; // a Planerare or the superuser approves unhandled expenses (MI-11) and splits them (MI-25)
  today: string; edit: (d: EditDlg) => void;
  by?: string; setBy?: (id: string) => void; // whose memories: the link's traveler, or the one the superuser picks (MI-17)
};


const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; // AC-06

/** A verdict's count in the button's corner: it pops when it grows, bounces when it shrinks and shrinks away at zero (MI-17, MI-28). */
function Count({ n }: { n: number }) {
  const el = useRef<HTMLSpanElement>(null), was = useRef(n);
  useEffect(() => {
    const e = el.current, prev = was.current;
    was.current = n;
    if (!e || prev === n || still() || typeof e.animate !== "function") return;
    e.animate(n > prev ? [{ transform: "scale(.2)" }, { transform: "scale(1.2)" }, { transform: "none" }]
      : n ? [{ transform: "scale(1.25)" }, { transform: "none" }] : [{ transform: "none", opacity: 1 }, { transform: "scale(0)", opacity: 0 }],
      { duration: 340, easing: "cubic-bezier(.34,1.56,.64,1)" });
  }, [n]);
  return <span ref={el} className="vcount" data-n={n} aria-hidden="true">{n || ""}</span>;
}

/** Upplevt or Pengar, as chosen with the icons in the title row (MI-15). */
export function Minnas(p: Props & { view: MinnasView }) {
  return p.memories !== "hidden" && p.view === "minnen" ? <Minnen {...p} /> : <Budget {...p} />;
}

/** The wishes that came true, as Önska's cards, with a verdict and a comment per traveler for the next trip; counts, no names,
 * no money (MI-16..MI-18, MI-20). */
function Minnen({ t, memories, run, today, edit, by, setBy }: Props) {
  const wishes = experienced(t, today);
  const writes = memories === "write" && !!by;
  const strip = useRef<HTMLDivElement>(null);
  const [wider, setWider] = useState(false); // the arrows only when the cards do not all fit (MI-27)
  useEffect(() => {
    const el = strip.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const check = () => setWider(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el); check();
    return () => ro.disconnect();
  }, [wishes.length]);
  /** One card further in the carousel (MI-27). */
  const step = (dir: 1 | -1) => {
    const el = strip.current, card = el?.firstElementChild as HTMLElement | null;
    el?.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + 14), behavior: still() ? "auto" : "smooth" });
  };
  const verdicts = (id: string, title: string) => {
    const n = verdictCounts(t, id), mine = by ? mineOf(t, id, by)?.verdict : undefined;
    return <div className="verdicts">
      {VERDICTS.map((v) => <span className="verdict" key={v}>{/* the count in the corner, as the money button once had (MI-17) */}
        {writes ? <IconButton icon={v} tip="up" pressed={mine === v} label={sv.minnas.give(sv.minnas.verdicts[v], title, n[v])}
          onClick={() => run((x) => memoryOps(x, id, by!, { verdict: v }), `verdict ${v}`)} />
          : <span className="btn ghost icon" role="img" aria-label={sv.minnas.count(sv.minnas.verdicts[v], n[v])} title={sv.minnas.verdicts[v]}><Icon name={v} /></span>}
        <Count n={n[v]} />
      </span>)}
      {writes && <IconButton icon="comment" tip="up" label={sv.minnas.write(title)} onClick={() => edit({ kind: "memory", dreamId: id, by: by! })} />}
    </div>;
  };
  return <>
    <div className="vhead"><h2>{sv.minnas.memories}</h2>
      <span className="end">
        {t.album && <a className="btn ghost icon tip-left" href={t.album} target="_blank" rel="noopener noreferrer" aria-label={sv.minnas.album} data-tip={sv.minnas.album}><Icon name="image" /></a>}
        {wider && <><IconButton icon="prev" label={sv.minnas.prev} onClick={() => step(-1)} tip="left" /><IconButton icon="next" label={sv.minnas.next} onClick={() => step(1)} tip="left" /></>}
      </span></div>
    {setBy && memories === "write" && t.travelers.length > 0 && /* the superuser gives verdicts as a chosen traveler (MI-17, UP-13) */
      <label className="as">{sv.minnas.as}<span className="rolepick field"><select value={by} onChange={(e) => setBy(e.target.value)}>
        {t.travelers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></span></label>}
    {!wishes.length ? <section className="card"><p className="ro">{sv.minnas.notYet}</p></section> : <>
      <div className="cstrip" ref={strip} role="region" aria-roledescription={sv.minnas.carousel} aria-label={sv.minnas.memories} tabIndex={0}>{wishes.map((d) => (
        <DreamCard key={d.id} t={t} d={d} i={t.dreams.indexOf(d)} votes={false}>
          {verdicts(d.id, d.title)}
          {notesOf(t, d.id).map((x) => <p className="said" key={x}>”{x}”</p>)}
        </DreamCard>
      ))}</div>
    </>}
  </>;
}

/** Money follows the role's level on expenses and budget; adding travelers belongs to the trip's settings (AU-21, AU-22). */
function Budget({ t, addExpense, addPayment, addPerson, expenses, budget, people, canAdd, approver, run, edit }: Props) {
  if (expenses === "hidden") return <section className="card"><h3>{sv.balance}</h3>{t.travelers.map((x) => <div className="row" key={x.id}><span>{x.name}</span></div>)}
    {people && <div className="add"><IconButton icon="plus" label={sv.addPerson} onClick={addPerson} tip="right" /></div>}</section>;
  const pays = expenses === "write";
  const name = (id: string) => t.travelers.find((x) => x.id === id)?.name ?? id;
  const counted = settled(t.expenses).filter((e) => !("waiting" in e)), open = unhandled(t.expenses); // MI-10: only approved ones are settled
  const bal = balances(t.travelers, counted, t.payments);
  const transfers = settle(bal);
  const follow = budgetVsActual(t.budget, t.expenses);
  const total = (k: "planned" | "actual") => Math.round(follow.reduce((a, r) => a + r[k] * 100, 0)) / 100;
  const group = t.travelers.length > 1;
  const out = outcome(t);
  const row = (e: Trip["expenses"][number], actions?: ReactNode) => (
    <div className="row mid" key={e.id}>
      <span>{e.hidden ? <HiddenText /> : <>{e.text}<TextEye t={t} texts={[e.text]} /></>}{"waiting" in e && <> <span className="badge">{sv.queue.waiting}</span></>}<br /><small className="ro">
        {activityTitle(t, e) && activityTitle(t, e) !== e.text && <>{activityTitle(t, e)} · </> /* MI-14, not twice */}{e.category} · {sv.paidBy.toLowerCase()} {name(e.paidBy)} · {sv.sharedBy.toLowerCase()} {e.sharedBy.length ? e.sharedBy.map(name).join(", ") : sv.everyone}
        {e.addedBy && <> · {sv.addedBy.toLowerCase()} {name(e.addedBy)}</>}
      </small></span>
      <span className="end">{expenseAmountText(e, t.currency)}{actions}</span>
    </div>
  );
  const split = (e: Trip["expenses"][number]) => approver && group && !("waiting" in e) // MI-25
    ? <IconButton icon="users" look="bare" tip="left" label={sv.minnas.split(e.text || sv.hiddenText)} onClick={() => edit({ kind: "split", id: e.id })} /> : undefined;
  return <>
    <div className="vhead"><h2>{sv.minnas.budget}</h2></div>
    <div className="cols">
      <div>
        {budget !== "hidden" && <section className="card">{/* MI-23: calm, never red */}
          <h3>{sv.minnas.outcome}</h3>
          {out.max !== undefined ? <>
            <div className="row"><span>{sv.minnas.used(kr(out.used), kr(out.max))}</span><span>{out.left! >= 0 ? sv.minnas.left(kr(out.left!)) : sv.minnas.over(kr(-out.left!))}</span></div>
            <div className="calmbar" role="img" aria-label={sv.minnas.used(kr(out.used), kr(out.max))}><span style={{ width: `${out.percent}%` }} /></div>
          </> : <div className="row"><span>{sv.minnas.spent}</span><span>{kr(out.used)}</span></div>}
        </section>}
        {open.length > 0 && <section className="card">{/* MI-11: unhandled expenses wait for a Planerare */}
          <h3>{sv.unhandled.title}</h3>
          {byDate(open).map((e) => row(e, approver ? <>
            <IconButton icon="check" look="bare" tip="left" label={sv.unhandled.approve(e.text)} onClick={() => run((x) => approveExpense(x, e.id), "approve expense")} />
            <IconButton icon="trash" look="bare" tip="left" label={sv.unhandled.reject(e.text)} onClick={() => { if (confirm(sv.unhandled.rejectAsk(e.text))) run((x) => rejectExpense(x, e.id), "reject expense"); }} />
          </> : <> <span className="badge">{sv.unhandled.waiting}</span></>))}
          {approver && <p className="ro note">{sv.unhandled.note}</p>}
        </section>}
        <details className="card sec">{/* closed at first, so settling up is near the top (MI-29) */}
          <summary><h3>{sv.minnas.listed(sv.expenses, t.expenses.length - open.length)}</h3></summary>
          {t.expenses.length > open.length ? byDate(t.expenses.filter((e) => !e.pending)).map((e) => row(e, split(e))) : <p className="ro">{sv.noExpenses}</p>}
          {canAdd && t.travelers.length > 0 && <div className="add"><IconButton icon="plus" label={sv.addExpense} onClick={addExpense} tip="right" /></div>}
        </details>
        <section className="card">
          <h3>{sv.balance}</h3>
          {!t.travelers.length && <p className="ro">{sv.noPeople}</p>}
          {t.travelers.map((x) => <div className="row" key={x.id}><span>{x.name}</span><span>{balanceText(bal[x.id] ?? 0)}</span></div>)}
          {people && <div className="add"><IconButton icon="plus" label={sv.addPerson} onClick={addPerson} tip="right" /></div>}
        </section>
        {group && (
          <section className="card">
            <h3>{sv.settleUp}</h3>
            {transfers.length ? transfers.map((x) => (
              <div className="row mid" key={`${x.from}-${x.to}`}>
                <span>{name(x.from)} → {name(x.to)}</span>
                <span className="end">{kr(x.amount)}{pays && <IconButton icon="check" look="bare" tip="left" label={`${sv.register} ${name(x.from)} → ${name(x.to)}`} onClick={() => addPayment(x)} />}</span>
              </div>
            )) : <p className="ro">{sv.allEven}</p>}
          </section>
        )}
      </div>
      <div>
        {budget !== "hidden" && <section className="card">
          <h3>{sv.budgetVsActual}</h3>
          {follow.map((r) => (
            <div className="row" key={r.category}>
              <span>{r.category || sv.hiddenText}</span>
              <span>{kr(r.actual)} {sv.of} {kr(r.planned)}{r.over && <span className="calm"> · {sv.overPlan}</span> /* MI-24: text, no warning colour */}</span>
            </div>
          ))}
          <div className="row"><b>{sv.sum}</b><b>{kr(total("actual"))} {sv.of} {kr(total("planned"))}</b></div>
        </section>}
        <details className="card sec">{/* MI-29 */}
          <summary><h3>{sv.minnas.listed(sv.payments, t.payments.length)}</h3></summary>
          {t.payments.length ? t.payments.map((x) => (
            <div className="row" key={x.id}>
              <span>{name(x.from)} → {name(x.to)}{(x.date || x.note || x.hidden) && <><br /><small className="ro">{[x.date && shortDate(x.date), x.note].filter(Boolean).join(" · ")}
                {x.hidden && <>{x.date ? " · " : ""}<HiddenText /></>}<TextEye t={t} texts={[x.note]} /></small></>}</span>
              <span>{kr(x.amount)}</span>
            </div>
          )) : <p className="ro">{sv.noPayments}</p>}
          {group && pays && <div className="add"><IconButton icon="plus" label={sv.addPayment} onClick={() => addPayment()} tip="right" /></div>}
        </details>
      </div>
    </div>
  </>;
}
