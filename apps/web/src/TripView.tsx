// Class names follow design/prototype.html, so the prototype CSS applies; additions live at the end of index.css.
import { lazy, Suspense, useEffect, useState, type DragEvent } from "react";
import { WISH_DRAG } from "./drag.ts";
import type { Op, Trip } from "@trip/schema";
import { activityTime, dateBadge, dayTime, dayTitle, stopLabel, todayId, anyOpen, timelineStops, titleHiddenFrom, dayTextWho, textWho, toggleAllLabel, tripDates, type Open } from "./format.ts";
import { wxLabel, wxRows, type Forecast } from "./weather.ts";
import { stampText, type Waiting } from "./offline.ts";
import type { Result } from "./edit.ts";
import { categoryIcon, dayIcons } from "./categories.ts";
import { sv } from "./sv.ts";
import type { Transfer } from "./money.ts";
import { Gear, Icon, IconButton } from "./Icons.tsx";
import { CatIcon, CatIcons, LineIcon } from "./CatIcon.tsx";

// Uppleva and Minnas load when their tab is first opened (PF-01).
const Uppleva = lazy(() => import("./Uppleva.tsx").then((m) => ({ default: m.Uppleva })));
const Minnas = lazy(() => import("./Minnas.tsx").then((m) => ({ default: m.Minnas })));
const Side = lazy(() => import("./Side.tsx"));
const Dreams = lazy(() => import("./Dreams.tsx"));
const PlanActivities = lazy(() => import("./Plan.tsx")); // edit mode only (ED-16)
const Proposals = lazy(() => import("./Proposals.tsx")); // MC-15
const PreviewActivities = lazy(() => import("./Proposals.tsx").then((m) => ({ default: m.PreviewActivities }))); // MC-17
import type { DayMarks, Preview } from "./Proposals.tsx";
import type { EditDlg } from "./editKinds.ts";
import { anyWrite, type Perms } from "./access.ts";
import { atLeast } from "@trip/schema/src/rules.ts";
import { hiddenFromIn } from "@trip/schema/src/hidden.ts";
import { hasTickets, ticketFor } from "./tickets.ts";
import type { MinnasView } from "./memories.ts";

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

/** A booking's kind as an icon, with the kind as accessible name and tooltip (BK-07). */
export function KindIcon({ kind }: { kind?: string }) {
  const k = (kind ?? "other") as keyof typeof kindIcon, label = sv.bookingKinds[k];
  return <span className="kind" role="img" aria-label={label} title={label}><Icon name={kindIcon[k] ?? "file"} /></span>;
}
const kindIcon = { stay: "bed", ticket: "ticket", other: "file", transport: "file" } as const;
/** Opens a booking's ticket files, when it has any (BK-10). Not an editing control. */
export const TicketButton = ({ b, edit }: { b: Trip["bookings"][number]; edit?: (d: EditDlg) => void }) =>
  edit && hasTickets(b) ? <IconButton icon="ticket" look="bare" tip="left" label={`${sv.tickets.show}: ${b.name}`} onClick={() => edit({ kind: "tickets", bookingId: b.id })} /> : null;

/** The pin of a fixed activity, for those who only read the plan (ED-24). */
export const PinMark = () => <span className="pinmark" role="img" aria-label={sv.pin.mark} title={sv.pin.mark}><Icon name="pin" /></span>;

export function Activities({ t, x, onPlace, edit }: { t: Trip; x: Day; onPlace: (id: string) => void; edit?: (d: EditDlg) => void }) {
  const who = hiddenFromIn(x);
  return <>{x.activities.map((a) => (
    <div className={`act ${who.has(a.id) ? "hiddenrow" : ""}`} key={a.id}>
      <ActivityWhen a={a} />{a.pinned && <PinMark />}
      <ActivityText t={t} a={a} who={who.get(a.id)} eye={edit && (() => edit({ kind: "hidden", dayId: x.id, id: a.id }))} onPlace={onPlace} />
      {(() => { const b = ticketFor(t, a.id); return b && <TicketButton b={b} edit={edit} />; })() /* BK-08 */}
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

function DayCard({ t, x, today, open, forecast, onToggle, onPlace, onTransport, edit, editing, run, marks }: {
  marks?: DayMarks | null; // set: the day as a proposal would leave it, read only; null: unchanged by it (MC-17)
  t: Trip; x: Day; today: boolean; open: boolean; forecast?: Forecast; onToggle: () => void; onPlace: (id: string) => void; onTransport: () => void; edit: (d: EditDlg) => void;
  editing: boolean; run: Run; // editing: the role may change the plan, with no lock (ED-21, AU-21)
}) {
  const badge = dateBadge(x.date), vehicles = [...new Set(x.legs.map((l) => l.vehicle))];
  const hid = [...new Set([...hiddenFromIn(x).values()].flat())]; // a closed day shows an eye for its hidden activities (AU-25)
  const titleWho = titleHiddenFrom(x, t); // a title that resembles one has the eye instead, opening the same list (AU-29)
  const sumWho = x.hiddenSummary ? [] : dayTextWho(t, x, x.summary); // AU-30
  const [hover, setHover] = useState(false); // a wish is dragged over the day (DB-17)
  const wishOver = (e: DragEvent) => editing && e.dataTransfer.types.includes(WISH_DRAG);
  return (
    <article className={`card day ${open ? "open" : ""} ${editing ? "" : "lock"} ${hover ? "dropday" : ""}`} id={`day-${x.id}`}
      onDragOver={(e) => { if (wishOver(e)) { e.preventDefault(); setHover(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(false); }} onDropCapture={() => setHover(false)}
      onDrop={(e) => { // a drop among the open day's activities is placed there (Plan.tsx); elsewhere on the day it lands last
        setHover(false);
        const wish = e.dataTransfer.getData(WISH_DRAG);
        if (!editing || !wish) return;
        e.preventDefault();
        import("./schedule.ts").then((m) => run((cur) => m.planWish(cur, wish, x.id), "plan wish")); // loaded on demand (PF-01)
      }}>
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
        </div>
      )}
      <div className="body">
        {marks !== undefined
          ? <Suspense fallback={<Activities t={t} x={x} onPlace={onPlace} />}><PreviewActivities t={t} x={x} m={marks ?? undefined} onPlace={onPlace} /></Suspense>
          : editing
          ? <Suspense fallback={<Activities t={t} x={x} onPlace={onPlace} edit={edit} />}><PlanActivities t={t} x={x} onPlace={onPlace} edit={edit} run={run} /></Suspense>
          : <Activities t={t} x={x} onPlace={onPlace} edit={edit} />}
        <div className="add"><IconButton icon="plus" label={sv.addActivity} onClick={() => edit({ kind: "activity", dayId: x.id })} mut tip="right" /></div> {/* UI-09 */}
        {vehicles.length > 0 && <p><button className="badge linkish" onClick={onTransport}><CatIcons ids={vehicles} /> {sv.travelTime}</button></p>}
      </div>
    </article>
  );
}

export type TripViewProps = {
  t: Trip; cover?: string; tab: Tab; open: Open; forecast: Record<string, Forecast>;
  setTab: (t: Tab) => void; toggleDay: (id: string) => void; toggleAll: () => void; jump: (id: string) => void;
  place: (id: string) => void; transport: (dayId: string) => void; vote: (i: number) => void; addDream: () => void; editImage: (id: string) => void; back: () => void; admin: () => void;
  today: string; upDay: string | null; setUpDay: (id: string) => void;
  addExpense: () => void; addShortExpense: (currency: string, activity?: { id: string; text: string; category?: string; dreamId?: string; activityId?: string }, pick?: { choices: { id: string; text: string; category?: string; dreamId?: string; activityId?: string }[]; guess?: string }) => void; /* Uppleva (UP-22, UP-30, UP-43) */ addPayment: (prefill?: Transfer) => void;
  edit: (d: EditDlg) => void; run: Run;
  perms: Perms; // what the role may see and change on this trip (AU-20, AU-21)
  self?: string; // the traveler of a personal link
  who?: { name: string; role: "traveler" | "planner" | "follower" }; // who is looking, shown in the header (AU-16)
  fullApp?: () => void; // in the app on the home screen: open the full app in Safari (PW-15)
  toChooser?: () => void; // back to the trips of the links on the phone (PW-16)
  notices: () => void; // the bell: notices on this phone (NT-03)
  forecastAt?: string; // offline: when the weather shown was fetched (PW-10)
  memoryBy?: string; setMemoryBy?: (id: string) => void; // whose hearts and sentences in Minnen (MI-17)
  waiting: Waiting[]; sending: boolean; retryWaiting: (id: string) => void; removeWaiting: (id: string) => void; // expenses not sent yet (PW-06, PW-09)
  review?: { approve: (pid: string) => Promise<string | null>; reject: (pid: string) => Promise<void> }; // proposals from an LLM client (MC-18)
};

export function TripView(p: TripViewProps) {
  const { t, tab, perms } = p, writes = anyWrite(perms);
  const seesMemories = (perms.view.mi.memories ?? "hidden") !== "hidden";
  const [miView, setMiView] = useState<MinnasView>("minnen"); // always Upplevt when Minnas opens, not remembered (MI-39)
  useEffect(() => { if (tab !== "mi") setMiView("minnen"); }, [tab]);
  const shownMi = seesMemories ? miView : "budget";
  const pickMi = (v: MinnasView) => setMiView(v);
  const views = seesMemories && <span className="viewpick" role="group" aria-label={sv.minnas.views}>{/* Upplevt or Pengar, on the right under the tabs (MI-39) */}
    <IconButton icon="memories" label={sv.minnas.memories} pressed={shownMi === "minnen"} onClick={() => pickMi("minnen")} tip="left" />
    <IconButton icon="banknote" label={sv.minnas.budget} pressed={shownMi === "budget"} onClick={() => pickMi("budget")} tip="left" />
  </span>;
  const lock = tab === "up" || !writes; // ED-11, AU-21; otherwise each part of Nåla follows the role's level, with no locks (ED-21)
  const [preview, setPreview] = useState<Preview | null>(null); // a proposal shown in the plan (MC-17)
  useEffect(() => { setPreview(null); }, [tab, t.revision]);
  const reviews = !!p.review && (perms.manager || p.who?.role === "planner"); // MC-19, US-14
  const days = [...(preview?.next ?? t).days].sort((a, b) => a.date.localeCompare(b.date));
  const now = todayId(t.days, p.today); // DC-15
  let main;
  if (tab === "dr") main = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Dreams t={t} write={perms.view.dr.dreams === "write"} vote={p.vote} addDream={p.addDream} editImage={p.editImage} open={(id) => p.edit({ kind: "wish", id })} /></Suspense>;
  else if (tab === "nala") main = <>
    <div className="tl">{timelineStops(t).map((s, i) => (
      <button className="stop" key={`${s.dayId}-${i}`} aria-current={s.dayId === now ? "date" : undefined} onClick={() => p.jump(s.dayId)}><b>{stopLabel(s)}</b><small>{s.sub}</small></button>
    ))}</div>
    <div className="bar top0">
      <IconButton icon={anyOpen(p.open) ? "collapse" : "expand"} label={toggleAllLabel(p.open)} onClick={p.toggleAll} tip="right" />
    </div><div style={{ height: 10 }}></div>
    {reviews && <Suspense fallback={null}><Proposals t={t} approve={p.review!.approve} reject={p.review!.reject} preview={preview} setPreview={setPreview} /></Suspense>}
    <div className="cols">
      <div>{days.map((x) => (
        <DayCard key={x.id} t={t} x={x} today={x.date === p.today} open={!!p.open[x.id] || !!preview?.marks.has(x.id)} forecast={p.forecast[x.id]} onToggle={() => p.toggleDay(x.id)}
          onPlace={p.place} onTransport={() => p.transport(x.id)} edit={p.edit} run={p.run} marks={preview ? preview.marks.get(x.id) ?? null : undefined}
          editing={!preview && perms.view.nala.plan === "write"} />
      ))}</div>
      <div><Suspense fallback={null}>
        <Side t={t} today={p.today} edit={p.edit} run={p.run} onPlace={p.place} parts={perms.view.nala} wishes={perms.view.dr.dreams !== "hidden"} />
      </Suspense></div>
    </div>
  </>;
  else if (tab === "up") main = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Uppleva {...p} /></Suspense>;
  else main = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Minnas t={t} addExpense={p.addExpense} addPayment={p.addPayment}
    expenses={perms.view.mi.expenses} budget={perms.view.mi.budget} memories={perms.view.mi.memories ?? "hidden"} canAdd={atLeast(perms.view.mi.expenses, "add") && (perms.manager || !!p.self)}
    approver={perms.manager || p.who?.role === "planner"} run={p.run} today={p.today} view={shownMi} views={views || undefined} edit={p.edit} by={p.memoryBy} setBy={p.self ? undefined : p.setMemoryBy} self={p.self} /></Suspense>;
  return <>
    <div className="top">
      {perms.scoped && !p.toChooser ? <span /> : <IconButton icon="back" label={sv.allTrips} onClick={p.toChooser ?? p.back} tip="right" />}
      <span className="topend">
        {p.who && (p.who.role === "follower"
          ? <span className="who follower">{p.who.name}</span>
          : <span className={`who ${p.who.role}`} role="img" aria-label={`${p.who.name}, ${sv.who[p.who.role]}`} title={sv.who[p.who.role]}>{p.who.name}</span>)}
        {/* the person's own settings for notices (NT-03) */}<IconButton icon="bell" label={sv.notice.bell} onClick={p.notices} tip="left" />
        {perms.settings && <Gear onClick={p.admin} label={sv.tripSettings} />}
        {p.fullApp && <IconButton icon="external" label={sv.fullApp} onClick={p.fullApp} tip="left" />}
      </span>
    </div>
    {p.cover && <img className="cover hero" src={p.cover} alt={t.imageAlt ?? ""} />}
    <div className="titlerow"><h1>{t.title}</h1></div><p className="ro">{tripDates(t)}{t.hiddenNote ? <> · <HiddenText /></> : t.note ? <> · {t.note}<TextEye t={t} texts={[t.note]} /></> : ""}</p>
    <div className="card manifest">{t.hiddenPurpose ? <HiddenText /> : <>{t.purpose || sv.noPurpose}<TextEye t={t} texts={[t.purpose]} /></>}</div> {/* AU-30 */}
    {perms.pages.length > 1 && <div className="tabs" role="tablist">{(Object.keys(sv.tabs) as Tab[]).filter((k) => perms.pages.includes(k)).map((k) => (
      <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => p.setTab(k)}>{sv.tabs[k]}</button>
    ))}</div>}
    <div className={`${lock ? "lock" : ""} ${writes ? "" : "guest"}`}>{main}</div>
    {(tab === "nala" || tab === "up") && Object.keys(p.forecast).length > 0 && (
      <p className="credit">{sv.weatherCredit} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>{p.forecastAt && <> · {sv.offline.weatherFrom(stampText(p.forecastAt, new Date(), t.timezone))}</>}</p>
    )}
  </>;
}
