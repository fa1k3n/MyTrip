// Summera: shared costs, payments and budget follow-up (MI-01..MI-08).
import type { Trip } from "@trip/schema";
import { kr, shortDate } from "./format.ts";
import { balanceText, balances, budgetVsActual, settle, type Transfer } from "./money.ts";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";

type Props = { t: Trip; addExpense: () => void; addPayment: (prefill?: Transfer) => void; addPerson: () => void };

export function Summera({ t, addExpense, addPayment, addPerson }: Props) {
  const name = (id: string) => t.travelers.find((x) => x.id === id)?.name ?? id;
  const bal = balances(t.travelers, t.expenses, t.payments);
  const transfers = settle(bal);
  const follow = budgetVsActual(t.budget, t.expenses);
  const total = (k: "planned" | "actual") => Math.round(follow.reduce((a, r) => a + r[k] * 100, 0)) / 100;
  const group = t.travelers.length > 1;
  return (
    <div className="cols">
      <div>
        <section className="card">
          <h3>{sv.balance}</h3>
          {!t.travelers.length && <p className="ro">{sv.noPeople}</p>}
          {t.travelers.map((x) => <div className="row" key={x.id}><span>{x.name}</span><span>{balanceText(bal[x.id] ?? 0)}</span></div>)}
          <div className="add"><IconButton icon="plus" label={sv.addPerson} onClick={addPerson} mut tip="right" /></div>
        </section>
        {group && (
          <section className="card">
            <h3>{sv.settleUp}</h3>
            {transfers.length ? transfers.map((x) => (
              <div className="row mid" key={`${x.from}-${x.to}`}>
                <span>{name(x.from)} → {name(x.to)}</span>
                <span className="end">{kr(x.amount)}<IconButton icon="check" look="bare" tip="left" label={`${sv.register} ${name(x.from)} → ${name(x.to)}`} onClick={() => addPayment(x)} mut /></span>
              </div>
            )) : <p className="ro">{sv.allEven}</p>}
          </section>
        )}
        <section className="card">
          <h3>{sv.expenses}</h3>
          {t.expenses.length ? t.expenses.map((e) => (
            <div className="row" key={e.id}>
              <span>{e.text}<br /><small className="ro">
                {e.category} · {sv.paidBy.toLowerCase()} {name(e.paidBy)} · {sv.sharedBy.toLowerCase()} {e.sharedBy.length ? e.sharedBy.map(name).join(", ") : sv.everyone}
                {e.addedBy && <> · {sv.addedBy.toLowerCase()} {name(e.addedBy)}</>}
              </small></span>
              <span>{kr(e.amount)}</span>
            </div>
          )) : <p className="ro">{sv.noExpenses}</p>}
          {t.travelers.length > 0 && <div className="add"><IconButton icon="plus" label={sv.addExpense} onClick={addExpense} mut tip="right" /></div>}
        </section>
      </div>
      <div>
        <section className="card">
          <h3>{sv.budgetVsActual}</h3>
          {follow.map((r) => (
            <div className="row" key={r.category}>
              <span>{r.category}</span>
              <span>{kr(r.actual)} {sv.of} {kr(r.planned)}{r.over && <span className="over"> · {sv.overPlan}</span>}</span>
            </div>
          ))}
          <div className="row"><b>{sv.sum}</b><b>{kr(total("actual"))} {sv.of} {kr(total("planned"))}</b></div>
        </section>
        <section className="card">
          <h3>{sv.payments}</h3>
          {t.payments.length ? t.payments.map((x) => (
            <div className="row" key={x.id}>
              <span>{name(x.from)} → {name(x.to)}{(x.date || x.note) && <><br /><small className="ro">{[x.date && shortDate(x.date), x.note].filter(Boolean).join(" · ")}</small></>}</span>
              <span>{kr(x.amount)}</span>
            </div>
          )) : <p className="ro">{sv.noPayments}</p>}
          {group && <div className="add"><IconButton icon="plus" label={sv.addPayment} onClick={() => addPayment()} mut tip="right" /></div>}
        </section>
      </div>
    </div>
  );
}
