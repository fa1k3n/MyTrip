// Class names follow design/prototype.html, so the prototype CSS applies; additions live at the end of index.css.
import { lazy, Suspense } from "react";
import type { Op, Trip } from "@trip/schema";
import { activityTime, dateBadge, dayTime, anyOpen, timelineStops, toggleAllLabel, tripDates, type Open } from "./format.ts";
import { wxLabel, wxRows, type Forecast } from "./weather.ts";
import type { Result } from "./edit.ts";
import { categoryIcon, dayIcons } from "./categories.ts";
import { sv } from "./sv.ts";
import type { Transfer } from "./money.ts";
import { Gear, IconButton } from "./Icons.tsx";
import { CatIcon, CatIcons, ICONS, LineIcon } from "./CatIcon.tsx";

// Uppleva and Summera load when their tab is first opened (PF-01).
const Uppleva = lazy(() => import("./Uppleva.tsx").then((m) => ({ default: m.Uppleva })));
const Summera = lazy(() => import("./Summera.tsx").then((m) => ({ default: m.Summera })));
const Side = lazy(() => import("./Side.tsx"));
import type { EditDlg } from "./editKinds.ts";

type Day = Trip["days"][number];
export type Tab = "dr" | "nala" | "up" | "mi";
/** Inline edits without a dialog; `build` gets the latest trip so a retry after a conflict uses fresh data. */
export type Run = (build: (t: Trip) => Op[] | Result, reason: string) => void;
const DREAM_BG = ["#E8D5C4", "#D5E0D8", "#EFE2BF"];

/** A place name as a link that opens the place window (PL-01, PL-02). */
export function PlaceLink({ t, id, text, onPlace }: { t: Trip; id?: string; text?: string; onPlace: (id: string) => void }) {
  const p = t.places.find((x) => x.id === id);
  if (!p) return <>{text}</>;
  return <button className="place" onClick={(e) => { e.stopPropagation(); onPlace(p.id); }}>{text ?? p.name}</button>;
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
      {wxRows(forecast).map(([s, v]) => <span key={s} className="wr"><LineIcon symbol={s} /><span>{v}</span></span>)}
    </div>
  );
}

function DayCard({ t, x, open, forecast, onToggle, onPlace, onTransport, edit }: {
  t: Trip; x: Day; open: boolean; forecast?: Forecast; onToggle: () => void; onPlace: (id: string) => void; onTransport: () => void; edit: (d: EditDlg) => void;
}) {
  const badge = dateBadge(x.date), vehicles = [...new Set(x.legs.map((l) => l.vehicle))];
  return (
    <article className={`card day ${open ? "open" : ""}`} id={`day-${x.id}`}>
      {/* The whole header toggles on click; the title is the keyboard control (DC-09). The clock opens transport and does not toggle (TM-04). */}
      <div className="hd" onClick={onToggle}>
        <div className="dcol"><div className="date"><b>{badge.d}</b><span>{badge.w}</span></div><Weather forecast={forecast} /></div>
        <div className="txt">
          <h3><button className="ttl" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onToggle(); }}>{x.title}</button></h3>
          <div className="sum">{x.summary}</div>
          <button className="time when" onClick={(e) => { e.stopPropagation(); onTransport(); }} aria-label={`${sv.transport}, ${dayTime(x)}`}><LineIcon shape="clock" /> {dayTime(x)}</button>
        </div>
        <span className="ico"><CatIcons ids={dayIcons(x)} /></span>
      </div>
      {open && (
        <div className="tools">
          <IconButton icon="plus" look="bare" tip="left" label={sv.addActivity} onClick={() => edit({ kind: "activity", dayId: x.id })} mut />
          <IconButton icon="edit" look="bare" tip="left" label={sv.editDay} onClick={() => edit({ kind: "day", id: x.id })} mut />
        </div>
      )}
      <div className="body">
        <Activities t={t} x={x} onPlace={onPlace} edit={edit} />
        {vehicles.length > 0 && <p><button className="badge linkish" onClick={onTransport}><CatIcons ids={vehicles} /> {sv.travelTime}</button></p>}
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
        <div className="img" style={{ background: ICONS[d.category] ? `color-mix(in srgb, ${ICONS[d.category].color} 22%, var(--card))` : DREAM_BG[i % 3] }}>
          <CatIcon id={categoryIcon(d.category) ?? d.icon} big /></div>
        <button className="heart" onClick={() => p.vote(i)} aria-label={sv.vote}>♥ {d.votes}</button>
        <div className="in"><h3>{d.title}</h3><span className="badge">{d.category}</span><div className="src">{d.source}</div></div>
      </article>
    ))}</div>
    <IconButton icon="plus" look="fab" tip="up" label={sv.addDream} onClick={p.addDream} mut />
  </>;
  else if (tab === "nala") main = <>
    <div className="tl">{timelineStops(t).map((s, i) => (
      <button className="stop" key={`${s.dayId}-${i}`} onClick={() => p.jump(s.dayId)}><b>{s.label}</b><small>{s.sub}</small></button>
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
      <div><Suspense fallback={null}>
        <Side t={t} today={p.today} chart={p.chart} toggleChart={p.toggleChart} edit={p.edit} run={p.run} onPlace={p.place} />
      </Suspense></div>
    </div>
  </>;
  else if (tab === "up") main = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Uppleva {...p} /></Suspense>;
  else main = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Summera t={t} addExpense={p.addExpense} addPayment={p.addPayment} addPerson={p.addPerson} /></Suspense>;
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
