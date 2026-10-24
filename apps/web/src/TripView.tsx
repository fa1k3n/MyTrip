// Markup and class names mirror design/prototype.html one to one, so the prototype CSS applies unchanged.
import type { Trip } from "@trip/schema";
import { activityTime, bookingDates, budgetByCategory, dateBadge, dayTime, kr, paidTotal, routeLabel, timelineStops, toggleAllLabel, tripDates, vehicleIcons, type Open } from "./format.ts";
import { forecastRows, weatherSymbol, type Forecast } from "./weather.ts";
import { sv } from "./sv.ts";

type Day = Trip["days"][number];
export type Tab = "dr" | "nala" | "ov";
const COL: Record<string, string> = { Transport: "#C87A53", Boende: "#7A9A82", "Mat/Fritid": "#D9B26F", "Övrigt": "#8C7F73" };
const DREAM_BG = ["#E8D5C4", "#D5E0D8", "#EFE2BF"];

function Donut({ items }: { items: Trip["budget"] }) {
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

function Budget({ t, lock, chart, onToggle }: { t: Trip; lock?: boolean; chart: boolean; onToggle: () => void }) {
  return (
    <section className="card">
      <h3>{sv.budget}</h3>
      <p className="ro">{sv.paidSoFar} {kr(paidTotal(t.budget))}</p>
      <div data-mut=""><button className="btn ghost" onClick={onToggle}>{chart ? sv.showList : sv.showChart}</button></div>
      {lock || chart ? <Donut items={t.budget} /> : t.budget.map((i) => (
        <div className="row" key={i.id}><span>{i.category}{i.owner ? ` · ${i.owner}` : ""}</span><span>{kr(i.amount)} {i.paid ? "✓" : ""}</span></div>
      ))}
    </section>
  );
}

function Bookings({ t }: { t: Trip }) {
  return (
    <section className="card">
      <h3>{sv.bookings}</h3>
      {t.bookings.map((b) => (
        <div className="row" key={b.id}>
          <span>{b.name}<br /><small className="ro">{bookingDates(b)}{b.reference ? ` · ${b.reference}` : ""}</small></span>
          <span className={`badge ${b.status === "paid" ? "ok" : ""}`}>{b.status}</span>
        </div>
      ))}
    </section>
  );
}

function DayCard({ t, x, open, forecast, onToggle, onPlace }: {
  t: Trip; x: Day; open: boolean; forecast?: Forecast; onToggle: () => void; onPlace: (name: string, address: string) => void;
}) {
  const badge = dateBadge(x.date), vehicles = vehicleIcons(x);
  return (
    <article className={`card day ${open ? "open" : ""}`} id={`day-${x.id}`}>
      <button className="hd" aria-expanded={open} onClick={onToggle}>
        <div className="date"><b>{badge.d}</b><span>{badge.w}</span></div>
        <div><h3>{x.title} {x.icons.join("")}</h3><div className="sum">{x.summary}</div><div className="time">🕐 {dayTime(x)}</div></div>
      </button>
      <div className="body">
        {x.activities.map((a) => {
          const p = t.places.find((p) => p.id === a.placeIds[0]);
          return (
            <div className="act" key={a.id}>
              <time>{activityTime(a)}</time>
              <span>{p ? <button className="place" onClick={() => onPlace(a.text, p.address)}>{a.text}</button> : a.text}</span>
            </div>
          );
        })}
        {forecast && (() => {
          const [cond, temp, wind] = forecastRows(forecast);
          return (
            <div className="wx" title={`${cond}, ${temp}, vind ${wind}`}>
              <div>{weatherSymbol(forecast.code)} {cond}</div><div>🌡️ {temp}</div><div>💨 {wind}</div>
            </div>
          );
        })()}
        {vehicles && <p><span className="badge">{vehicles} {sv.travelTime}</span></p>}
      </div>
    </article>
  );
}

export type TripViewProps = {
  t: Trip; cover?: string; tab: Tab; open: Open; chart: boolean; forecast: Record<string, Forecast>;
  setTab: (t: Tab) => void; toggleDay: (id: string) => void; toggleAll: () => void; jump: (id: string) => void; toggleChart: () => void;
  place: (name: string, address: string) => void; vote: (i: number) => void; addDream: () => void; back: () => void; admin: () => void;
};

export function TripView(p: TripViewProps) {
  const { t, tab } = p, lock = tab === "ov";
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
    <button className="btn fab" data-mut="" onClick={p.addDream}>{sv.addDream}</button>
  </>;
  else if (tab === "nala") main = <>
    <div className="tl">{timelineStops(t).map((s) => (
      <button className="stop" key={s.dayId} onClick={() => p.jump(s.dayId)}><b>{s.label}</b><small>{s.sub}</small></button>
    ))}</div>
    <button className="btn ghost" onClick={p.toggleAll}>{toggleAllLabel(p.open)}</button><div style={{ height: 10 }}></div>
    <div className="cols">
      <div>{days.map((x) => <DayCard key={x.id} t={t} x={x} open={!!p.open[x.id]} forecast={p.forecast[x.id]} onToggle={() => p.toggleDay(x.id)} onPlace={p.place} />)}</div>
      <div><Bookings t={t} /><Budget t={t} chart={p.chart} onToggle={p.toggleChart} /></div>
    </div>
    {Object.keys(p.forecast).length > 0 && <p className="credit">Väderdata: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a></p>}
  </>;
  else main = (
    <div className="cols">
      <div>
        <section className="card"><h3>{sv.route}</h3><div className="map">{sv.map} {routeLabel(days)}</div></section>
        <section className="card"><h3>{sv.todo}</h3>{t.tasks.map((k) => <div className="row" key={k.id}><span>{k.text}</span></div>)}</section>
      </div>
      <div><Budget t={t} lock chart={p.chart} onToggle={p.toggleChart} /></div>
    </div>
  );
  return <>
    <div className="top"><button className="btn ghost" onClick={p.back}>{sv.allTrips}</button><button className="btn ghost" data-mut="" onClick={p.admin}>{sv.admin}</button></div>
    {p.cover && <img className="cover hero" src={p.cover} alt={t.imageAlt ?? ""} />}
    <h1>{t.title}</h1><p className="ro">{tripDates(t)}{t.note ? ` · ${t.note}` : ""}</p><div className="card manifest">{t.purpose || sv.noPurpose}</div>
    <div className="tabs" role="tablist">{(Object.keys(sv.tabs) as Tab[]).map((k) => (
      <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => p.setTab(k)}>{sv.tabs[k]}</button>
    ))}</div>
    <div className={lock ? "lock" : ""}>{main}</div>
  </>;
}
