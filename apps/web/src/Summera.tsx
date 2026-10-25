// Summera: shared costs, payments and budget follow-up (MI-01..MI-08), and unhandled expenses to approve (MI-09..MI-11).
import type { ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { kr, shortDate } from "./format.ts";
import { approveExpense, balanceText, balances, budgetVsActual, rejectExpense, settle, settled, unhandled, type Transfer } from "./money.ts";
import { IconButton } from "./Icons.tsx";
import type { Level } from "@trip/schema/src/rules.ts";
import { sv } from "./sv.ts";
import { HiddenText, TextEye, type Run } from "./TripView.tsx";

type Props = {
  t: Trip; addExpense: () => void; addPayment: (prefill?: Transfer) => void; addPerson: () => void;
  expenses: Level; budget: Level; people: boolean; canAdd: boolean; // what the role may see and change (AU-21)
  approver: boolean; run: Run; // a Planerare or the superuser approves unhandled expenses (MI-11)
};

/** Money follows the role's level on expenses and budget; adding travelers belongs to the trip's settings (AU-21, AU-22). */
export function Summera({ t, addExpense, addPayment, addPerson, expenses, budget, people, canAdd, approver, run }: Props) {
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
  const row = (e: Trip["expenses"][number], actions?: ReactNode) => (
    <div className="row mid" key={e.id}>
      <span>{e.hidden ? <HiddenText /> : <>{e.text}<TextEye t={t} texts={[e.text]} /></>}{"waiting" in e && <> <span className="badge">{sv.queue.waiting}</span></>}<br /><small className="ro">
        {e.category} · {sv.paidBy.toLowerCase()} {name(e.paidBy)} · {sv.sharedBy.toLowerCase()} {e.sharedBy.length ? e.sharedBy.map(name).join(", ") : sv.everyone}
        {e.addedBy && <> · {sv.addedBy.toLowerCase()} {name(e.addedBy)}</>}
      </small></span>
      <span className="end">{kr(e.amount)}{actions}</span>
    </div>
  );
  return (
    <div className="cols">
      <div>
        {open.length > 0 && <section className="card">{/* MI-11: unhandled expenses wait for a Planerare */}
          <h3>{sv.unhandled.title}</h3>
          {open.map((e) => row(e, approver ? <>
            <IconButton icon="check" look="bare" tip="left" label={sv.unhandled.approve(e.text)} onClick={() => run((x) => approveExpense(x, e.id), "approve expense")} />
            <IconButton icon="trash" look="bare" tip="left" label={sv.unhandled.reject(e.text)} onClick={() => { if (confirm(sv.unhandled.rejectAsk(e.text))) run((x) => rejectExpense(x, e.id), "reject expense"); }} />
          </> : <> <span className="badge">{sv.unhandled.waiting}</span></>))}
          {approver && <p className="ro note">{sv.unhandled.note}</p>}
        </section>}
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
        <section className="card">
          <h3>{sv.expenses}</h3>
          {t.expenses.length > open.length ? t.expenses.filter((e) => !e.pending).map((e) => row(e)) : <p className="ro">{sv.noExpenses}</p>}
          {canAdd && t.travelers.length > 0 && <div className="add"><IconButton icon="plus" label={sv.addExpense} onClick={addExpense} tip="right" /></div>}
        </section>
      </div>
      <div>
        {budget !== "hidden" && <section className="card">
          <h3>{sv.budgetVsActual}</h3>
          {follow.map((r) => (
            <div className="row" key={r.category}>
              <span>{r.category || sv.hiddenText}</span>
              <span>{kr(r.actual)} {sv.of} {kr(r.planned)}{r.over && <span className="over"> · {sv.overPlan}</span>}</span>
            </div>
          ))}
          <div className="row"><b>{sv.sum}</b><b>{kr(total("actual"))} {sv.of} {kr(total("planned"))}</b></div>
        </section>}
        <section className="card">
          <h3>{sv.payments}</h3>
          {t.payments.length ? t.payments.map((x) => (
            <div className="row" key={x.id}>
              <span>{name(x.from)} → {name(x.to)}{(x.date || x.note || x.hidden) && <><br /><small className="ro">{[x.date && shortDate(x.date), x.note].filter(Boolean).join(" · ")}
                {x.hidden && <>{x.date ? " · " : ""}<HiddenText /></>}<TextEye t={t} texts={[x.note]} /></small></>}</span>
              <span>{kr(x.amount)}</span>
            </div>
          )) : <p className="ro">{sv.noPayments}</p>}
          {group && pays && <div className="add"><IconButton icon="plus" label={sv.addPayment} onClick={() => addPayment()} tip="right" /></div>}
        </section>
      </div>
    </div>
  );
}
