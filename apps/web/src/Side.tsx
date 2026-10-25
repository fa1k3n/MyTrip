// Nåla's side column: bookings, budget, tasks, practical information and packing lists.
// Loaded on demand with the Nåla tab to keep the page under 200 KB (PF-01).
import { useState, type FormEvent, type ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { bookingDates, budgetByCategory, kr, shortDate } from "./format.ts";
import { amountText, budgetRows, money } from "./budget.ts";
import { addPacking, isPacked, packedCount, removePacking, togglePacked, toggleTask } from "./edit.ts";
import { isOverdue } from "./today.ts";
import { sv } from "./sv.ts";
import { Icon, IconButton } from "./Icons.tsx";
import { PartLock, PlaceLink, type Run } from "./TripView.tsx";
import type { EditDlg } from "./editKinds.ts";

const COL: Record<string, string> = { Transport: "#C87A53", Boende: "#7A9A82", "Mat/Fritid": "#D9B26F", "Övrigt": "#8C7F73" };

type Part = (id: string) => { on: boolean; toggle: () => void };

/** A collapsible section of the side column, closed by default (BG-01, PK-02), with its own lock (ED-18). */
const Section = ({ title, lock, children }: { title: string; lock: ReturnType<Part>; children: ReactNode }) => (
  <details className={`card sec ${lock.on ? "" : "lock"}`}>
    <summary><h3>{title}</h3><span className="seclock" onClick={(e) => e.preventDefault()}><PartLock on={lock.on} part={title} toggle={lock.toggle} /></span></summary>
    {children}
  </details>
);

function Donut({ items }: { items: { category: string; amount?: number; paid: boolean }[] }) {
  const groups = budgetByCategory(items);
  const total = groups.reduce((a, [, v]) => a + v, 0);
  const r = 40, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donutbox">
      <svg viewBox="0 0 120 120" width="150" role="img" aria-label={sv.budgetChart}>
        {groups.map(([k, v]) => {
          const l = (v / (total || 1)) * c, o = off;
          off += l;
          return <circle key={k} r={r} cx="60" cy="60" fill="none" stroke={COL[k] ?? COL["Övrigt"]} strokeWidth="18" strokeDasharray={`${l} ${c - l}`} strokeDashoffset={-o} transform="rotate(-90 60 60)" />;
        })}
        <text x="60" y="58" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{kr(total)}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="7" fill="currentColor">{sv.total}</text>
      </svg>
      <div className="legend">{groups.map(([k, v]) => <div key={k}><i style={{ background: COL[k] ?? COL["Övrigt"] }}></i>{k} {kr(v)}</div>)}</div>
    </div>
  );
}

function Budget({ t, chart, onToggle, edit, part }: { part: Part; t: Trip; chart: boolean; onToggle: () => void; edit: (d: EditDlg) => void }) {
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
    <Section title={sv.budget} lock={part("budget")}>
      <div className="row mid"><span className="ro">{sv.paidSoFar} {sum}</span>
        <IconButton icon={chart ? "list" : "chart"} label={chart ? sv.showList : sv.showChart} onClick={onToggle} tip="left" /></div>
      {chart
        ? <Donut items={t.budget.filter((i) => !i.currency || i.currency === t.currency)} />
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

function Bookings({ t, edit, onPlace, part }: { part: Part; t: Trip; edit: (d: EditDlg) => void; onPlace: (id: string) => void }) {
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

function Tasks({ t, today, edit, run, onPlace, part }: { part: Part; t: Trip; today: string; edit: (d: EditDlg) => void; run: Run; onPlace: (id: string) => void }) {
  return (
    <Section title={sv.todo} lock={part("tasks")}>
      {!t.tasks.length && <p className="ro">{sv.noTasks}</p>}
      {t.tasks.map((k) => (
        <div className="row mid todo" key={k.id}>
          <label className="check">
            <input type="checkbox" checked={k.done} onChange={() => run((x) => toggleTask(x, k.id), k.done ? "task undone" : "task done")} />
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

function Info({ t, edit, onPlace, part }: { part: Part; t: Trip; edit: (d: EditDlg) => void; onPlace: (id: string) => void }) {
  return (
    <Section title={sv.info} lock={part("info")}>
      {!t.info.length && <p className="ro">{sv.noInfo}</p>}
      {t.info.map((x) => (
        <div className="row mid" key={x.id}>
          <span><b>{x.placeId ? <PlaceLink t={t} id={x.placeId} text={x.title} onPlace={onPlace} /> : x.title}</b>
            {x.text && <><br /><small className="ro">{x.text}</small></>}
            {x.unsuitable && <><br /><small className="over">{sv.unsuitable}: {x.unsuitable}</small></>}
            {x.verify && <><br /><small className="ro">{sv.verify}</small></>}</span>
          <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${x.title}`} onClick={() => edit({ kind: "info", id: x.id })} mut />
        </div>
      ))}
      <div className="add"><IconButton icon="plus" label={sv.addInfo} onClick={() => edit({ kind: "info" })} mut tip="right" /></div>
    </Section>
  );
}

function PackingList({ name, items, packed, count, onAdd, onRemove, onCheck }: {
  name: string; items: string[]; packed: (item: string) => boolean; count: { packed: number; total: number };
  onAdd: (text: string) => void; onRemove: (i: number) => void; onCheck: (item: string) => void;
}) {
  const [v, setV] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (v.trim()) { onAdd(v); setV(""); } };
  return (
    <details className="box">
      <summary><span>{name} <small className="ro">({count.packed}/{count.total})</small></span></summary>
      <ul>{items.map((it, i) => (
        <li key={`${i}-${it}`}>
          <label className="check"><input type="checkbox" checked={packed(it)} onChange={() => onCheck(it)} /><span className={packed(it) ? "done" : ""}>{it}</span></label>
          <IconButton icon="trash" look="bare" tip="left" label={`${sv.removeItem} ${it}`} onClick={() => onRemove(i)} mut /></li>
      ))}</ul>
      <form className="addrow" data-mut="" onSubmit={submit}>
        <input value={v} onChange={(e) => setV(e.target.value)} aria-label={`${sv.itemLabel}, ${name}`} placeholder={sv.itemLabel} />
        <button type="submit" className="btn ghost icon tip-left" aria-label={`${sv.addItem}: ${name}`} data-tip={sv.addItem}><Icon name="plus" /></button>
      </form>
    </details>
  );
}

function Packing({ t, run, part }: { part: Part; t: Trip; run: Run }) {
  const lists = [{ id: "shared", name: sv.sharedList, items: t.packing },
    ...t.travelers.map((x) => ({ id: x.id, name: x.age ? `${x.name}, ${x.age} ${sv.years}` : x.name, items: x.packing }))]; // PK-03
  return (
    <Section title={sv.packing} lock={part("packing")}>
      {lists.map((l) => (
        <PackingList key={l.id} name={l.name} items={l.items} packed={(it) => isPacked(t, l.id, it)} count={packedCount(t, l.id)}
          onCheck={(it) => run((x) => togglePacked(x, l.id, it), isPacked(t, l.id, it) ? "unpacked" : "packed")}
          onAdd={(text) => run((x) => addPacking(x, l.id, text), "add packing")}
          onRemove={(i) => run((x) => removePacking(x, l.id, i), "remove packing")} />
      ))}
    </Section>
  );
}

export default function Side({ t, today, chart, toggleChart, edit, run, onPlace, part }: {
  part: Part;
  t: Trip; today: string; chart: boolean; toggleChart: () => void; edit: (d: EditDlg) => void; run: Run; onPlace: (id: string) => void;
}) {
  return <>
    <Bookings part={part} t={t} edit={edit} onPlace={onPlace} />
    <Budget part={part} t={t} chart={chart} onToggle={toggleChart} edit={edit} />
    <Tasks part={part} t={t} today={today} edit={edit} run={run} onPlace={onPlace} />
    <Info part={part} t={t} edit={edit} onPlace={onPlace} />
    <Packing part={part} t={t} run={run} />
  </>;
}
