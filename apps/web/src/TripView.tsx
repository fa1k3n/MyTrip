// Class names follow design/prototype.html, so the prototype CSS applies; additions live at the end of index.css.
import { lazy, Suspense } from "react";
import type { Op, Trip } from "@trip/schema";
import { activityTime, dateBadge, dayTime, dayTitle, stopLabel, todayId, anyOpen, anyUnlocked, editModeLabel, isUnlocked, toggleAllUnlock, toggleUnlock, unlockLabel, type Unlock, timelineStops, titleHiddenFrom, dayTextWho, textWho, toggleAllLabel, tripDates, type Open } from "./format.ts";
import { wxLabel, wxRows, type Forecast } from "./weather.ts";
import type { Result } from "./edit.ts";
import { categoryIcon, dayIcons } from "./categories.ts";
import { sv } from "./sv.ts";
import type { Transfer } from "./money.ts";
import { Gear, Icon, IconButton } from "./Icons.tsx";
import { CatIcon, CatIcons, LineIcon } from "./CatIcon.tsx";

// Uppleva and Summera load when their tab is first opened (PF-01).
const Uppleva = lazy(() => import("./Uppleva.tsx").then((m) => ({ default: m.Uppleva })));
const Summera = lazy(() => import("./Summera.tsx").then((m) => ({ default: m.Summera })));
const Side = lazy(() => import("./Side.tsx"));
const Dreams = lazy(() => import("./Dreams.tsx"));
const PlanActivities = lazy(() => import("./Plan.tsx")); // edit mode only (ED-16)
import type { EditDlg } from "./editKinds.ts";
import { anyWrite, type Perms } from "./access.ts";
import { atLeast } from "@trip/schema/src/rules.ts";
import { hiddenFromIn } from "@trip/schema/src/hidden.ts";

type Day = Trip["days"][number];
export type Tab = "dr" | "nala" | "up" | "mi";
/** Inline edits without a dialog; `build` gets the latest trip so a retry after a conflict uses fresh data. */
export type Run = (build: (t: Trip) => Op[] | Result, reason: string) => void;

/** A place name as a link that opens the place window (PL-01, PL-02). */
export function PlaceLink({ t, id, text, onPlace }: { t: Trip; id?: string; text?: string; onPlace: (id: string) => void }) {
  const p = t.places.find((x) => x.id === id);
  if (!p) return <>{text}</>;
  return <button className="place" onClick={(e) => { e.stopPropagation(); onPlace(p.id); }}>{text ?? p.name}</button>;
}

/** "Dold text" in place of a text that gives away an activity hidden from the viewer (AU-30). */
export const HiddenText = () => <span className="hiddenact"><Icon name="eyeoff" />{sv.hiddenText}</span>;
/** The eye beside a text that gives away a hidden activity, for those who see it, naming whom it is hidden from (AU-30). */
export function TextEye({ t, texts, placeId }: { t: Trip; texts: (string | undefined)[]; placeId?: string }) {
  const who = textWho(t, texts, placeId);
  return who.length ? <Eye t={t} who={who} /> : null;
}

/** The text of one piece of practical information, in Nåla and in Uppleva (PI-01..PI-04, UP-15). */
export const InfoText = ({ t, x, onPlace }: { t: Trip; x: Trip["info"][number]; onPlace: (id: string) => void }) => x.hidden ? <span><HiddenText /></span> : (
  <span><b>{x.placeId ? <PlaceLink t={t} id={x.placeId} text={x.title} onPlace={onPlace} /> : x.title}</b><TextEye t={t} texts={[x.title, x.text, x.unsuitable]} placeId={x.placeId} />
    {x.text && <><br /><small className="ro">{x.text}</small></>}
    {x.unsuitable && <><br /><small className="over">{sv.unsuitable}: {x.unsuitable}</small></>}
    {x.verify && <><br /><small className="ro">{sv.verify}</small></>}</span>
);

export type Activity = Day["activities"][number];

/** The time with the category icon under it (ED-15). */
export function ActivityWhen({ a }: { a: Activity }) {
  return <span className="when-col"><time>{activityTime(a)}</time>{a.category && categoryIcon(a.category) && <CatIcon id={a.category} />}</span>;
}

/** An eye naming the travelers something is hidden from; it opens the list of whom when it can (AU-25). */
export function Eye({ t, who, open }: { t: Trip; who: string[]; open?: () => void }) {
  const label = sv.hiddenMark(t.travelers.filter((x) => who.includes(x.id)).map((x) => x.name).join(", "));
  return open ? <span className="eye" onClick={(e) => e.stopPropagation()}><IconButton icon="eyeoff" look="bare" label={label} onClick={open} /></span>
    : <span className="eye" role="img" aria-label={label} title={label}><Icon name="eyeoff" /></span>;
}

/** The short title, then the places and the note on lines of their own (ED-19). A hidden activity reaches a Resenär or
 * Följare without its title and shows as "Dold aktivitet"; a Planerare sees the title marked as hidden (AU-18), also when it
 * is hidden for resembling a hidden activity (AU-24): `who` comes from hiddenFromIn, and the mark is an eye that opens whom (AU-25). */
export function ActivityText({ t, a, who, eye, onPlace }: { t: Trip; a: Activity; who?: string[]; eye?: () => void; onPlace: (id: string) => void }) {
  if (a.hidden && !a.text) return <span className="what"><span className="name hiddenact"><Icon name="eyeoff" />{sv.hiddenActivity}</span></span>;
  const one = a.placeIds.length === 1;
  return (
    <span className="what">
      <span className="name">{one ? <PlaceLink t={t} id={a.placeIds[0]} text={a.text} onPlace={onPlace} /> : a.text}
        {!!who?.length && <Eye t={t} who={who} open={eye} />}</span>
      {!one && a.placeIds.length > 0 && <small className="places">{a.placeIds.map((id, n) => <span key={id}>{n ? ", " : ""}<PlaceLink t={t} id={id} onPlace={onPlace} /></span>)}</small>}
      {a.note && <small className="ro anote">{a.note}</small>}
    </span>
  );
}

export function Activities({ t, x, onPlace, edit }: { t: Trip; x: Day; onPlace: (id: string) => void; edit?: (d: EditDlg) => void }) {
  const who = hiddenFromIn(x);
  return <>{x.activities.map((a) => (
    <div className={`act ${who.has(a.id) ? "hiddenrow" : ""}`} key={a.id}>
      <ActivityWhen a={a} />
      <ActivityText t={t} a={a} who={who.get(a.id)} eye={edit && (() => edit({ kind: "hidden", dayId: x.id, id: a.id }))} onPlace={onPlace} />
      {edit && <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${a.text}`} onClick={() => edit({ kind: "activity", dayId: x.id, id: a.id })} mut />}
    </div>
  ))}</>;
}

/** Forecast under the date badge: symbols in one column, values in the next (WX-02..WX-09, WX-13). */
/** `big`: one larger row, as at the top of Uppleva (UP-11). */
export function Weather({ forecast, big }: { forecast?: Forecast; big?: boolean }) {
  if (!forecast) return null;
  const label = wxLabel(forecast);
  return (
    <div className={`wxs ${big ? "big" : ""}`} role="img" aria-label={label} title={label}>
      {wxRows(forecast).map(([s, v]) => <span key={s} className="wr"><LineIcon symbol={s} /><span>{v}</span></span>)}
    </div>
  );
}

/** The lock of one part of Nåla (ED-18). */
export const PartLock = ({ on, part, toggle, tip = "left" }: { on: boolean; part: string; toggle: () => void; tip?: "left" | "right" }) =>
  <span className="partlock"><IconButton icon={on ? "unlock" : "lock"} look="bare" tip={tip} label={unlockLabel(on, part)} onClick={toggle} pressed={on} /></span>;

function DayCard({ t, x, today, open, forecast, onToggle, onPlace, onTransport, edit, editing, toggleLock, run }: {
  t: Trip; x: Day; today: boolean; open: boolean; forecast?: Forecast; onToggle: () => void; onPlace: (id: string) => void; onTransport: () => void; edit: (d: EditDlg) => void;
  editing: boolean; toggleLock?: () => void; run: Run; // no toggleLock: the role may not change the plan (AU-21)
}) {
  const badge = dateBadge(x.date), vehicles = [...new Set(x.legs.map((l) => l.vehicle))];
  const hid = [...new Set([...hiddenFromIn(x).values()].flat())]; // a closed day shows an eye for its hidden activities (AU-25)
  const titleWho = titleHiddenFrom(x, t); // a title that resembles one has the eye instead, opening the same list (AU-29)
  const sumWho = x.hiddenSummary ? [] : dayTextWho(t, x, x.summary); // AU-30
  return (
    <article className={`card day ${open ? "open" : ""} ${editing ? "" : "lock"}`} id={`day-${x.id}`}>
      {/* The whole header toggles on click; the title is the keyboard control (DC-09). The clock opens transport and does not toggle (TM-04). */}
      <div className="hd" onClick={onToggle}>
        <div className="dcol"><div className="date"><b>{badge.d}</b><span>{badge.w}</span></div><Weather forecast={forecast} /></div>
        <div className="txt">
          {today && <small className="ro">{sv.today}</small>} {/* DC-15 */}
          <h3><button className="ttl" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onToggle(); }}>{dayTitle(x)}</button>
            {titleWho.length > 0 && <Eye t={t} who={titleWho} open={() => edit({ kind: "hidden", dayId: x.id })} />}</h3>
          <div className="sum">{x.hiddenSummary ? <HiddenText /> : x.summary}{sumWho.length > 0 && <Eye t={t} who={sumWho} open={() => edit({ kind: "hidden", dayId: x.id })} />}</div>
          <button className="time when" onClick={(e) => { e.stopPropagation(); onTransport(); }} aria-label={`${sv.transport}, ${dayTime(x)}`}><LineIcon shape="clock" /> {dayTime(x)}</button>
        </div>
        <span className="ico">{!open && hid.length > 0 && !titleWho.length && <Eye t={t} who={hid} open={() => edit({ kind: "hidden", dayId: x.id })} />}<CatIcons ids={dayIcons(x)} /></span>
      </div>
      {open && (
        <div className="tools">
          <IconButton icon="edit" look="bare" tip="left" label={sv.editDay} onClick={() => edit({ kind: "day", id: x.id })} mut />
          {toggleLock && <PartLock on={editing} part={dayTitle(x)} toggle={toggleLock} />}
        </div>
      )}
      <div className="body">
        {editing
          ? <Suspense fallback={<Activities t={t} x={x} onPlace={onPlace} edit={edit} />}><PlanActivities t={t} x={x} onPlace={onPlace} edit={edit} run={run} /></Suspense>
          : <Activities t={t} x={x} onPlace={onPlace} edit={edit} />}
        <div className="add"><IconButton icon="plus" label={sv.addActivity} onClick={() => edit({ kind: "activity", dayId: x.id })} mut tip="right" /></div> {/* UI-09 */}
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
  unlock: Unlock; setUnlock: (u: Unlock) => void; // edit mode in Nåla, per part (ED-13, ED-18)
  perms: Perms; // what the role may see and change on this trip (AU-20, AU-21)
  self?: string; // the traveler of a personal link
  who?: { name: string; role: "traveler" | "planner" | "follower" }; // who is looking, shown in the header (AU-16)
  fullApp?: () => void; // in the app on the home screen: open the full app in Safari (PW-15)
};

export function TripView(p: TripViewProps) {
  const { t, tab, perms } = p, writes = anyWrite(perms);
  const lock = tab === "up" || !writes; // ED-11, AU-21; otherwise Nåla locks each part on its own (ED-18)
  const part = (id: string) => ({ on: isUnlocked(p.unlock, id), toggle: () => p.setUnlock(toggleUnlock(p.unlock, id)) });
  const days = [...t.days].sort((a, b) => a.date.localeCompare(b.date));
  const now = todayId(t.days, p.today); // DC-15
  let main;
  if (tab === "dr") main = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Dreams t={t} write={perms.view.dr.dreams === "write"} vote={p.vote} addDream={p.addDream} /></Suspense>;
  else if (tab === "nala") main = <>
    <div className="tl">{timelineStops(t).map((s, i) => (
      <button className="stop" key={`${s.dayId}-${i}`} aria-current={s.dayId === now ? "date" : undefined} onClick={() => p.jump(s.dayId)}><b>{stopLabel(s)}</b><small>{s.sub}</small></button>
    ))}</div>
    <div className="bar top0">
      <IconButton icon={anyOpen(p.open) ? "collapse" : "expand"} label={toggleAllLabel(p.open)} onClick={p.toggleAll} tip="right" />
    </div><div style={{ height: 10 }}></div>
    <div className="cols">
      <div>{days.map((x) => (
        <DayCard key={x.id} t={t} x={x} today={x.date === p.today} open={!!p.open[x.id]} forecast={p.forecast[x.id]} onToggle={() => p.toggleDay(x.id)}
          onPlace={p.place} onTransport={() => p.transport(x.id)} edit={p.edit} run={p.run}
          editing={perms.view.nala.plan === "write" && part(`day:${x.id}`).on} toggleLock={perms.view.nala.plan === "write" ? part(`day:${x.id}`).toggle : undefined} />
      ))}</div>
      <div><Suspense fallback={null}>
        <Side t={t} today={p.today} chart={p.chart} toggleChart={p.toggleChart} edit={p.edit} run={p.run} onPlace={p.place} part={part} parts={perms.view.nala} />
      </Suspense></div>
    </div>
  </>;
  else if (tab === "up") main = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Uppleva {...p} /></Suspense>;
  else main = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Summera t={t} addExpense={p.addExpense} addPayment={p.addPayment} addPerson={p.addPerson}
    expenses={perms.view.mi.expenses} budget={perms.view.mi.budget} people={perms.settings} canAdd={atLeast(perms.view.mi.expenses, "add") && (perms.superuser || !!p.self)} /></Suspense>;
  return <>
    {(perms.settings || p.who || p.fullApp) && <div className="top">
      {perms.scoped ? <span /> : <IconButton icon="back" label={sv.allTrips} onClick={p.back} tip="right" />}
      <span className="topend">
        {p.who && (p.who.role === "follower"
          ? <span className="who follower">{p.who.name}</span>
          : <span className={`who ${p.who.role}`} role="img" aria-label={`${p.who.name}, ${sv.who[p.who.role]}`} title={sv.who[p.who.role]}>{p.who.name}</span>)}
        {perms.settings && <Gear onClick={p.admin} />}
        {p.fullApp && <IconButton icon="external" label={sv.fullApp} onClick={p.fullApp} tip="left" />}
      </span>
    </div>}
    {p.cover && <img className="cover hero" src={p.cover} alt={t.imageAlt ?? ""} />}
    <div className="titlerow"><h1>{t.title}</h1>
      {tab === "nala" && writes && <IconButton icon={anyUnlocked(p.unlock) ? "unlock" : "lock"} label={editModeLabel(anyUnlocked(p.unlock))} onClick={() => p.setUnlock(toggleAllUnlock(p.unlock))} tip="left" pressed={anyUnlocked(p.unlock)} />}
    </div><p className="ro">{tripDates(t)}{t.hiddenNote ? <> · <HiddenText /></> : t.note ? <> · {t.note}<TextEye t={t} texts={[t.note]} /></> : ""}</p>
    <div className="card manifest">{t.hiddenPurpose ? <HiddenText /> : <>{t.purpose || sv.noPurpose}<TextEye t={t} texts={[t.purpose]} /></>}</div> {/* AU-30 */}
    {perms.pages.length > 1 && <div className="tabs" role="tablist">{(Object.keys(sv.tabs) as Tab[]).filter((k) => perms.pages.includes(k)).map((k) => (
      <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => p.setTab(k)}>{sv.tabs[k]}</button>
    ))}</div>}
    <div className={`${lock ? "lock" : ""} ${writes ? "" : "guest"}`}>{main}</div>
    {(tab === "nala" || tab === "up") && Object.keys(p.forecast).length > 0 && (
      <p className="credit">{sv.weatherCredit} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a></p>
    )}
  </>;
}
