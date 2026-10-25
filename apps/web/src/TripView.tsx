// Class names follow design/prototype.html, so the prototype CSS applies; additions live at the end of index.css.
import { useState, type FormEvent, type ReactNode } from "react";
import type { Op, Trip } from "@trip/schema";
import { activityTime, bookingDates, budgetByCategory, dateBadge, dayTime, kr, anyOpen, shortDate, timelineStops, toggleAllLabel, tripDates, vehicleIcons, type Open } from "./format.ts";
import { wxLabel, wxRows, type Forecast } from "./weather.ts";
import { amountText, budgetRows, money } from "./budget.ts";
import { addPacking, removePacking, toggleTask, type Result } from "./edit.ts";
import { isOverdue } from "./today.ts";
import { sv } from "./sv.ts";
import type { Transfer } from "./money.ts";
import { Uppleva } from "./Uppleva.tsx";
import { Summera } from "./Summera.tsx";
import { Gear } from "./Settings.tsx";
import { Icon, IconButton } from "./Icons.tsx";
import type { EditDlg } from "./editKinds.ts";

type Day = Trip["days"][number];
export type Tab = "dr" | "nala" | "up" | "mi";
/** Inline edits without a dialog; `build` gets the latest trip so a retry after a conflict uses fresh data. */
export type Run = (build: (t: Trip) => Op[] | Result, reason: string) => void;
const COL: Record<string, string> = { Transport: "#C87A53", Boende: "#7A9A82", "Mat/Fritid": "#D9B26F", "Övrigt": "#8C7F73" };
const DREAM_BG = ["#E8D5C4", "#D5E0D8", "#EFE2BF"];

/** A collapsible section of the side column, closed by default (BG-01, PK-02). */
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <details className="card sec"><summary><h3>{title}</h3></summary>{children}</details>
);

/** A place name as a link that opens the place window (PL-01, PL-02). */
export function PlaceLink({ t, id, text, onPlace }: { t: Trip; id?: string; text?: string; onPlace: (id: string) => void }) {
  const p = t.places.find((x) => x.id === id);
  if (!p) return <>{text}</>;
  return <button className="place" onClick={(e) => { e.stopPropagation(); onPlace(p.id); }}>{text ?? p.name}</button>;
}

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

function Budget({ t, chart, onToggle, edit }: { t: Trip; chart: boolean; onToggle: () => void; edit: (d: EditDlg) => void }) {
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
    <Section title={sv.budget}>
      <div className="row mid"><span className="ro">{sv.paidSoFar} {sum}</span>
        <span data-mut=""><IconButton icon={chart ? "list" : "chart"} label={chart ? sv.showList : sv.showChart} onClick={onToggle} tip="left" /></span></div>
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

function Bookings({ t, edit, onPlace }: { t: Trip; edit: (d: EditDlg) => void; onPlace: (id: string) => void }) {
  return (
    <Section title={sv.bookings}>
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

function Tasks({ t, today, edit, run, onPlace }: { t: Trip; today: string; edit: (d: EditDlg) => void; run: Run; onPlace: (id: string) => void }) {
  return (
    <Section title={sv.todo}>
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

function Info({ t, edit, onPlace }: { t: Trip; edit: (d: EditDlg) => void; onPlace: (id: string) => void }) {
  return (
    <Section title={sv.info}>
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

function PackingList({ name, items, onAdd, onRemove }: { name: string; items: string[]; onAdd: (text: string) => void; onRemove: (i: number) => void }) {
  const [v, setV] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (v.trim()) { onAdd(v); setV(""); } };
  return (
    <details className="box">
      <summary>{name} <small className="ro">({items.length})</small></summary>
      <ul>{items.map((it, i) => (
        <li key={`${i}-${it}`}><span>{it}</span><IconButton icon="trash" look="bare" tip="left" label={`${sv.removeItem} ${it}`} onClick={() => onRemove(i)} mut /></li>
      ))}</ul>
      <form className="addrow" data-mut="" onSubmit={submit}>
        <input value={v} onChange={(e) => setV(e.target.value)} aria-label={`${sv.itemLabel}, ${name}`} placeholder={sv.itemLabel} />
        <button type="submit" className="btn ghost icon tip-left" aria-label={`${sv.addItem}: ${name}`} data-tip={sv.addItem}><Icon name="plus" /></button>
      </form>
    </details>
  );
}

function Packing({ t, run }: { t: Trip; run: Run }) {
  const lists = [{ id: "shared", name: sv.sharedList, items: t.packing },
    ...t.travelers.map((x) => ({ id: x.id, name: x.age ? `${x.name}, ${x.age} ${sv.years}` : x.name, items: x.packing }))]; // PK-03
  return (
    <Section title={sv.packing}>
      {lists.map((l) => (
        <PackingList key={l.id} name={l.name} items={l.items}
          onAdd={(text) => run((x) => addPacking(x, l.id, text), "add packing")}
          onRemove={(i) => run((x) => removePacking(x, l.id, i), "remove packing")} />
      ))}
    </Section>
  );
}

export function Activities({ t, x, onPlace, edit }: { t: Trip; x: Day; onPlace: (id: string) => void; edit?: (d: EditDlg) => void }) {
  return <>{x.activities.map((a) => (
    <div className="act" key={a.id}>
      <time>{activityTime(a)}</time>
      <span>{a.placeIds.length === 1
        ? <PlaceLink t={t} id={a.placeIds[0]} text={a.text} onPlace={onPlace} />
        : <>{a.text}{a.placeIds.map((id, n) => <span key={id}>{n ? ", " : ": "}<PlaceLink t={t} id={id} onPlace={onPlace} /></span>)}</>}</span>
      {edit && <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${a.text}`} onClick={() => edit({ kind: "activity", dayId: x.id, id: a.id })} mut />}
    </div>
  ))}</>;
}

/** Forecast under the date badge: symbols in one column, values in the next (WX-02..WX-09, WX-13). */
export function Weather({ forecast }: { forecast?: Forecast }) {
  if (!forecast) return null;
  const label = wxLabel(forecast);
  return (
    <div className="wxs" role="img" aria-label={label} title={label}>
      {wxRows(forecast).map(([s, v]) => <span key={s} className="wr"><span aria-hidden="true">{s}</span><span>{v}</span></span>)}
    </div>
  );
}

function DayCard({ t, x, open, forecast, onToggle, onPlace, onTransport, edit }: {
  t: Trip; x: Day; open: boolean; forecast?: Forecast; onToggle: () => void; onPlace: (id: string) => void; onTransport: () => void; edit: (d: EditDlg) => void;
}) {
  const badge = dateBadge(x.date), vehicles = vehicleIcons(x);
  return (
    <article className={`card day ${open ? "open" : ""}`} id={`day-${x.id}`}>
      {/* The whole header toggles on click; the title is the keyboard control (DC-09). The clock opens transport and does not toggle (TM-04). */}
      <div className="hd" onClick={onToggle}>
        <div className="dcol"><div className="date"><b>{badge.d}</b><span>{badge.w}</span></div><Weather forecast={forecast} /></div>
        <div className="txt">
          <h3><button className="ttl" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onToggle(); }}>{x.title}</button></h3>
          <div className="sum">{x.summary}</div>
          <button className="time when" onClick={(e) => { e.stopPropagation(); onTransport(); }} aria-label={`${sv.transport}, ${dayTime(x)}`}>🕐 {dayTime(x)}</button>
        </div>
        <span className="ico" aria-hidden="true">{x.icons.join("")}</span>
      </div>
      {open && (
        <div className="tools">
          <IconButton icon="plus" look="bare" tip="left" label={sv.addActivity} onClick={() => edit({ kind: "activity", dayId: x.id })} mut />
          <IconButton icon="edit" look="bare" tip="left" label={sv.editDay} onClick={() => edit({ kind: "day", id: x.id })} mut />
        </div>
      )}
      <div className="body">
        <Activities t={t} x={x} onPlace={onPlace} edit={edit} />
        {vehicles && <p><button className="badge linkish" onClick={onTransport}>{vehicles} {sv.travelTime}</button></p>}
      </div>
    </article>
  );
}

export type TripViewProps = {
  t: Trip; cover?: string; tab: Tab; open: Open; chart: boolean; forecast: Record<string, Forecast>;
  setTab: (t: Tab) => void; toggleDay: (id: string) => void; toggleAll: () => void; jump: (id: string) => void; toggleChart: () => void;
  place: (id: string) => void; transport: (dayId: string) => void; vote: (i: number) => void; addDream: () => void; back: () => void; admin: () => void;
  today: string; upDay: string | null; setUpDay: (id: string) => void;
  addExpense: () => void; addPayment: (prefill?: Transfer) => void; addPerson: () => void;
  edit: (d: EditDlg) => void; run: Run;
};

export function TripView(p: TripViewProps) {
  const { t, tab } = p, lock = tab === "up";
  const days = [...t.days].sort((a, b) => a.date.localeCompare(b.date));
  let main;
  if (tab === "dr") main = <>
    <div className="dreams">{t.dreams.map((d, i) => (
      <article className="card dream" key={d.id}>
        <div className="img" style={{ background: DREAM_BG[i % 3] }}>{d.icon}</div>
        <button className="heart" onClick={() => p.vote(i)} aria-label={sv.vote}>♥ {d.votes}</button>
        <div className="in"><h3>{d.title}</h3><span className="badge">{d.category}</span><div className="src">{d.source}</div></div>
      </article>
    ))}</div>
    <IconButton icon="plus" look="fab" tip="up" label={sv.addDream} onClick={p.addDream} mut />
  </>;
  else if (tab === "nala") main = <>
    <div className="tl">{timelineStops(t).map((s) => (
      <button className="stop" key={s.dayId} onClick={() => p.jump(s.dayId)}><b>{s.label}</b><small>{s.sub}</small></button>
    ))}</div>
    <div className="bar top0">
      <IconButton icon={anyOpen(p.open) ? "collapse" : "expand"} label={toggleAllLabel(p.open)} onClick={p.toggleAll} tip="right" />
      <IconButton icon="plus" label={sv.addDay} onClick={() => p.edit({ kind: "day" })} mut tip="right" />
    </div><div style={{ height: 10 }}></div>
    <div className="cols">
      <div>{days.map((x) => (
        <DayCard key={x.id} t={t} x={x} open={!!p.open[x.id]} forecast={p.forecast[x.id]} onToggle={() => p.toggleDay(x.id)}
          onPlace={p.place} onTransport={() => p.transport(x.id)} edit={p.edit} />
      ))}</div>
      <div>
        <Bookings t={t} edit={p.edit} onPlace={p.place} />
        <Budget t={t} chart={p.chart} onToggle={p.toggleChart} edit={p.edit} />
        <Tasks t={t} today={p.today} edit={p.edit} run={p.run} onPlace={p.place} />
        <Info t={t} edit={p.edit} onPlace={p.place} />
        <Packing t={t} run={p.run} />
      </div>
    </div>
  </>;
  else if (tab === "up") main = <Uppleva {...p} />;
  else main = <Summera t={t} addExpense={p.addExpense} addPayment={p.addPayment} addPerson={p.addPerson} />;
  return <>
    <div className="top"><IconButton icon="back" label={sv.allTrips} onClick={p.back} tip="right" /><Gear onClick={p.admin} /></div>
    {p.cover && <img className="cover hero" src={p.cover} alt={t.imageAlt ?? ""} />}
    <h1>{t.title}</h1><p className="ro">{tripDates(t)}{t.note ? ` · ${t.note}` : ""}</p><div className="card manifest">{t.purpose || sv.noPurpose}</div>
    <div className="tabs" role="tablist">{(Object.keys(sv.tabs) as Tab[]).map((k) => (
      <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => p.setTab(k)}>{sv.tabs[k]}</button>
    ))}</div>
    <div className={lock ? "lock" : ""}>{main}</div>
    {(tab === "nala" || tab === "up") && Object.keys(p.forecast).length > 0 && (
      <p className="credit">{sv.weatherCredit} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a></p>
    )}
  </>;
}
