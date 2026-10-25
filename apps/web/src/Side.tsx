// Nåla's side column: bookings, budget, tasks, practical information and packing lists.
// Loaded on demand with the Nåla tab to keep the page under 200 KB (PF-01).
import { useState, type FormEvent, type ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { bookingDates, kr, shortDate } from "./format.ts";
import { Donut, LimitIcon, limitClass } from "./Donut.tsx";
import { amountText, budgetRows, money } from "./budget.ts";
import { addPacking, isPacked, packedCount, removePacking, togglePacked, toggleTask } from "./edit.ts";
import { isOverdue } from "./today.ts";
import { sv } from "./sv.ts";
import { Icon, IconButton } from "./Icons.tsx";
import { InfoText, PartLock, PlaceLink, type Run } from "./TripView.tsx";
import type { EditDlg } from "./editKinds.ts";
import { atLeast, type Level } from "@trip/schema/src/rules.ts";

type Part = (id: string) => { on: boolean; toggle: () => void };
type Lock = ReturnType<Part> | null;
type LockOf = (id: string) => Lock; // null: the role may not change that section (AU-21)

/** A collapsible section of the side column, closed by default (BG-01, PK-02), with its own lock (ED-18). */
/** A section the role may not change has no lock and stays locked (AU-21). */
const Section = ({ title, lock, flag, tint = "", children }: { title: string; lock: Lock; flag?: ReactNode; tint?: string; children: ReactNode }) => (
  <details className={`card sec ${lock?.on ? "" : "lock"} ${tint}`}>
    <summary><h3>{title}</h3>{flag}{lock && <span className="seclock" onClick={(e) => e.preventDefault()}><PartLock on={lock.on} part={title} toggle={lock.toggle} /></span>}</summary>
    {children}
  </details>
);

function Budget({ t, chart, onToggle, edit, part }: { part: LockOf; t: Trip; chart: boolean; onToggle: () => void; edit: (d: EditDlg) => void }) {
  const { paid, totals, other } = budgetRows(t.budget, t.currency);
  const label = (i: Trip["budget"][number]) => `${i.note ?? i.category}${i.owner ? ` · ${i.owner}` : ""}`;
  const row = (i: Trip["budget"][number], est: boolean) => (
    <div className={`row mid ${est ? "est" : ""}`} key={i.id}>
      <span>{label(i)}</span>
      <span className="end">{amountText(i, t.currency)}
        <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${label(i)}`} onClick={() => edit({ kind: "budget", id: i.id })} mut /></span>
    </div>
  );
  const sum = totals.map((x) => money(x.sum, x.currency)).join(" + ") || kr(0);
  return (
    <Section title={sv.budget} lock={part("budget")} flag={<LimitIcon t={t} />} tint={limitClass(t)}>
      <div className="row mid"><span className="ro">{sv.paidSoFar} {sum}</span>
        <IconButton icon={chart ? "list" : "chart"} label={chart ? sv.showList : sv.showChart} onClick={onToggle} tip="left" /></div>
      {chart
        ? <Donut t={t} />
        : <>
          {paid.map((i) => row(i, false))}
          {paid.length > 0 && <div className="row"><b>{sv.paidSoFar.replace(":", "")}</b><b>{sum}</b></div>}
          {other.map((i) => row(i, true))}
          <p className="ro note">{sv.budgetNote}</p>
        </>}
      <div className="add"><IconButton icon="plus" label={sv.addCost} onClick={() => edit({ kind: "budget" })} mut tip="right" /></div>
    </Section>
  );
}

function Bookings({ t, edit, onPlace, part }: { part: LockOf; t: Trip; edit: (d: EditDlg) => void; onPlace: (id: string) => void }) {
  return (
    <Section title={sv.bookings} lock={part("bookings")}>
      {t.bookings.map((b) => (
        <div className={`row mid ${b.status === "cancelled" ? "off" : ""}`} key={b.id}>
          <span><PlaceLink t={t} id={b.placeId} text={b.name} onPlace={onPlace} /><br />
            <small className="ro">{bookingDates(b)}{b.reference ? ` · ${b.reference}` : ""}</small>
            {b.note && <><br /><small className="ro">{b.note}</small></>}</span>
          <span className="end"><span className={`badge ${b.status === "paid" ? "ok" : ""}`}>{sv.badge[b.status]}</span>
            <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${b.name}`} onClick={() => edit({ kind: "booking", id: b.id })} mut /></span>
        </div>
      ))}
      <div className="add"><IconButton icon="plus" label={sv.addBooking} onClick={() => edit({ kind: "booking" })} mut tip="right" /></div>
    </Section>
  );
}

function Tasks({ t, today, edit, run, onPlace, part, tick }: { part: LockOf; t: Trip; today: string; edit: (d: EditDlg) => void; run: Run; onPlace: (id: string) => void; tick: boolean }) {
  return (
    <Section title={sv.todo} lock={part("tasks")}>
      {!t.tasks.length && <p className="ro">{sv.noTasks}</p>}
      {t.tasks.map((k) => (
        <div className="row mid todo" key={k.id}>
          <label className="check">
            <input type="checkbox" checked={k.done} disabled={!tick} onChange={() => run((x) => toggleTask(x, k.id), k.done ? "task undone" : "task done")} />
            <span className={k.done ? "done" : ""}>{k.text}
              {k.placeId && <> · <PlaceLink t={t} id={k.placeId} onPlace={onPlace} /></>}
              {k.due && <small className="ro"> · {shortDate(k.due)}</small>}
              {isOverdue(k, today) && <> <span className="badge late">{sv.overdue}</span></>}</span>
          </label>
          <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${k.text}`} onClick={() => edit({ kind: "task", id: k.id })} mut />
        </div>
      ))}
      <p className="ro note">{sv.tasksShared}</p>
      <div className="add"><IconButton icon="plus" label={sv.addTask} onClick={() => edit({ kind: "task" })} mut tip="right" /></div>
    </Section>
  );
}

function Info({ t, edit, onPlace, part }: { part: LockOf; t: Trip; edit: (d: EditDlg) => void; onPlace: (id: string) => void }) {
  return (
    <Section title={sv.info} lock={part("info")}>
      {!t.info.length && <p className="ro">{sv.noInfo}</p>}
      {t.info.map((x) => (
        <div className="row mid" key={x.id}>
          <InfoText t={t} x={x} onPlace={onPlace} />
          <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${x.title}`} onClick={() => edit({ kind: "info", id: x.id })} mut />
        </div>
      ))}
      <div className="add"><IconButton icon="plus" label={sv.addInfo} onClick={() => edit({ kind: "info" })} mut tip="right" /></div>
    </Section>
  );
}

function PackingList({ name, items, packed, count, onAdd, onRemove, onCheck, tick }: {
  name: string; items: string[]; packed: (item: string) => boolean; count: { packed: number; total: number }; tick: boolean;
  onAdd: (text: string) => void; onRemove: (i: number) => void; onCheck: (item: string) => void;
}) {
  const [v, setV] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (v.trim()) { onAdd(v); setV(""); } };
  return (
    <details className="box">
      <summary><span>{name} <small className="ro">({count.packed}/{count.total})</small></span></summary>
      <ul>{items.map((it, i) => (
        <li key={`${i}-${it}`}>
          <label className="check"><input type="checkbox" checked={packed(it)} disabled={!tick} onChange={() => onCheck(it)} /><span className={packed(it) ? "done" : ""}>{it}</span></label>
          <IconButton icon="trash" look="bare" tip="left" label={`${sv.removeItem} ${it}`} onClick={() => onRemove(i)} mut /></li>
      ))}</ul>
      <form className="addrow" data-mut="" onSubmit={submit}>
        <input value={v} onChange={(e) => setV(e.target.value)} aria-label={`${sv.itemLabel}, ${name}`} placeholder={sv.itemLabel} />
        <button type="submit" className="btn ghost icon tip-left" aria-label={`${sv.addItem}: ${name}`} data-tip={sv.addItem}><Icon name="plus" /></button>
      </form>
    </details>
  );
}

function Packing({ t, run, part, tick }: { part: LockOf; t: Trip; run: Run; tick: boolean }) {
  const lists = [{ id: "shared", name: sv.sharedList, items: t.packing },
    ...t.travelers.map((x) => ({ id: x.id, name: x.age ? `${x.name}, ${x.age} ${sv.years}` : x.name, items: x.packing }))]; // PK-03
  return (
    <Section title={sv.packing} lock={part("packing")}>
      {lists.map((l) => (
        <PackingList key={l.id} tick={tick} name={l.name} items={l.items} packed={(it) => isPacked(t, l.id, it)} count={packedCount(t, l.id)}
          onCheck={(it) => run((x) => togglePacked(x, l.id, it), isPacked(t, l.id, it) ? "unpacked" : "packed")}
          onAdd={(text) => run((x) => addPacking(x, l.id, text), "add packing")}
          onRemove={(i) => run((x) => removePacking(x, l.id, i), "remove packing")} />
      ))}
    </Section>
  );
}

/** Each section follows the role's level: hidden, read, check or change (AU-20, AU-21). */
export default function Side({ t, today, chart, toggleChart, edit, run, onPlace, part: lockOf, parts }: {
  part: Part; parts: Record<string, Level>; // the role's levels on Nåla's components (AU-20)
  t: Trip; today: string; chart: boolean; toggleChart: () => void; edit: (d: EditDlg) => void; run: Run; onPlace: (id: string) => void;
}) {
  const part = (id: string) => (parts[id] === "write" ? lockOf(id) : null);
  return <>
    {parts.bookings !== "hidden" && <Bookings part={part} t={t} edit={edit} onPlace={onPlace} />}
    {parts.budget !== "hidden" && <Budget part={part} t={t} chart={chart} onToggle={toggleChart} edit={edit} />}
    {parts.tasks !== "hidden" && <Tasks part={part} t={t} today={today} edit={edit} run={run} onPlace={onPlace} tick={atLeast(parts.tasks, "check")} />}
    {parts.info !== "hidden" && <Info part={part} t={t} edit={edit} onPlace={onPlace} />}
    {parts.packing !== "hidden" && <Packing part={part} t={t} run={run} tick={atLeast(parts.packing, "check")} />}
  </>;
}
