// Uppleva: one day of the trip, read-only except for adding expenses (UP-01..UP-13).
import { useEffect, useState } from "react";
import { bookingDates, bookingTimes, dateBadge, dayTitle, kr, titleHiddenFrom, statusBadge } from "./format.ts";
import { adjacentDay, bookingsOn, budgetStatus, clockIn, dayHeading, pickDay } from "./today.ts";
import { clashes, durationText, nowAt, upDayTime, upTime } from "./upday.ts";
import { currencyFor, dayCountry, expenseAmountText, keptCountries, lookupCountry, rateFor } from "./currency.ts";
import { geocodeUrl } from "./weather.ts";
import { Icon, IconButton } from "./Icons.tsx";
import { Donut, LimitIcon, limitClass } from "./Donut.tsx";
import { atLeast } from "@trip/schema/src/rules.ts";
import { ActivityText, Eye, HiddenText, InfoText, KindIcon, PlaceLink, TextEye, TicketButton, Weather, type TripViewProps } from "./TripView.tsx";
import { dayIcons } from "./categories.ts";
import { CatIcon, CatIcons, LineIcon } from "./CatIcon.tsx";
import { ticketFor } from "./tickets.ts";
import { hiddenFromIn } from "@trip/schema/src/hidden.ts";
import type { Trip } from "@trip/schema";
import { sv } from "./sv.ts";

export function Uppleva(p: TripViewProps) {
  const { t } = p;
  const day = t.days.find((d) => d.id === p.upDay) ?? pickDay(t.days, p.today);
  if (!day) return <section className="card"><p className="ro">{sv.noDays}</p></section>;
  const s = budgetStatus(t.budget, t.expenses);
  const bookings = bookingsOn(t.bookings, day.date);
  const badge = dateBadge(day.date); // the same date badge as the day cards in Nåla
  const parts = p.perms.view.up, info = p.perms.parts.info !== "hidden" && t.info.length > 0; // practical information as in Nåla (UP-15)
  const side = parts.budget !== "hidden" || parts.bookings !== "hidden" || info; // Uppleva's components (AU-20)
  const canAdd = atLeast(parts.expenses, "add") && (p.perms.superuser || !!p.self); // the superuser and personal links (UP-12, AU-22)
  const spent = p.perms.parts.expenses !== "hidden"; // the sum of expenses only when the role may see expenses somewhere
  const vehicles = [...new Set(day.legs.map((l) => l.vehicle))]; // UP-14
  const titleWho = titleHiddenFrom(day, t); // AU-29, AU-30
  const prev = adjacentDay(t.days, day.id, -1), next = adjacentDay(t.days, day.id, 1);
  return <>
    {/* no timeline of stops: the day changes with the arrows (UP-31) */}
    <div className={`cols ${side ? "" : "one"}`}>
      <div>
        <section className="card uphead">
          <div className="dayhead">
            <div className="daytitle">
              <span className="date" aria-hidden="true"><b>{badge.d}</b><span>{badge.w}</span></span>
              <div>
                {day.date === p.today && <small className="ro" aria-hidden="true">{sv.today}</small>}
                <h3><span className="sr">{dayHeading(day.date, p.today)}: </span>{dayTitle(day)}
                  {titleWho.length > 0 && <Eye t={t} who={titleWho} open={p.edit && (() => p.edit!({ kind: "hidden", dayId: day.id }))} />}</h3>
                <div className="dmeta"><CatIcons ids={dayIcons(day)} /><button className="time when" onClick={() => p.transport(day.id)} aria-label={`${sv.transport}, ${upDayTime(day)}`}><LineIcon shape="clock" /> {upDayTime(day)}</button> {/* no "ca" (UP-36) */}</div>
                <Weather forecast={p.forecast[day.id]} big />
              </div>
            </div>
            <span className="daynav">
              {/* A missing day leaves an empty place, so the other button never moves under the pointer (UP-09). */}
              {prev ? <IconButton icon="prev" look="bare" tip="left" label={`${sv.prevDay}: ${dayHeading(prev.date, p.today)}`} onClick={() => p.setUpDay(prev.id)} /> : <span className="navgap" />}
              {next ? <IconButton icon="next" look="bare" tip="left" label={`${sv.nextDay}: ${dayHeading(next.date, p.today)}`} onClick={() => p.setUpDay(next.id)} /> : <span className="navgap" />}
            </span>
          </div>
          {!day.activities.length && <p className="ro">{sv.noActivities}</p>}
          {vehicles.length > 0 && <p><button className="badge linkish" onClick={() => p.transport(day.id)}><CatIcons ids={vehicles} /> {sv.travelTime}</button></p>} {/* as in Nåla (UP-14) */}
        </section>
        <Timeline p={p} day={day} add={canAdd && t.travelers.length > 0} />
      </div>
      {side && <div>{/* budget and bookings, if the role may see them (AU-17, AU-21) */}
        {parts.budget !== "hidden" && <section className={`card ${limitClass(t)}`}>
          <div className="sechead"><h3>{sv.budget}</h3><LimitIcon t={t} big /></div>
          <Donut t={t} />
          <div className="row"><span>{sv.paidAhead}</span><span>{kr(s.paid)}</span></div>
          <div className="row"><span>{sv.leftToPay}</span><span>{kr(s.left)}</span></div>
          {spent && <div className="row"><span>{sv.spentOnTrip}</span><span>{kr(s.spent)}</span></div>}
          {p.waiting.map((x) => ( // counted above, marked until the server has them (PW-06, PW-09)
            <div className="row mid waiting" key={x.expense.id}>
              <span>{String(x.expense.text ?? "")}<br /><small className={x.state === "failed" ? "over" : "ro"}>{x.state === "failed" ? sv.queue.failed(x.reason ?? "") : sv.queue.waiting}</small></span>
              <span className="end">{expenseAmountText(x.expense, t.currency)}{x.state === "failed" && <>
                <IconButton icon="refresh" look="bare" tip="left" label={`${sv.queue.retry}: ${String(x.expense.text ?? "")}`} onClick={() => p.retryWaiting(x.expense.id)} />
                <IconButton icon="trash" look="bare" tip="left" label={`${sv.queue.remove}: ${String(x.expense.text ?? "")}`} onClick={() => { if (confirm(sv.queue.removeAsk)) p.removeWaiting(x.expense.id); }} /></>}</span>
            </div>
          ))}
          {/* expenses are added from the day, not here (UP-30) */}
        </section>}
        {parts.bookings !== "hidden" && <section className="card">
          <h3>{sv.bookings}</h3>
          {bookings.length ? bookings.map((b) => {
            return (
              <div className="row mid" key={b.id}>
                <span>
                  <KindIcon kind={b.kind} />{b.hidden ? <HiddenText /> : <><PlaceLink t={t} id={b.placeId} text={b.name} onPlace={p.place} /><TextEye t={t} texts={[b.name, b.note]} placeId={b.placeId} /></>}<br />
                  <small className="ro">{bookingDates(b)}{bookingTimes(b) ? ` · ${bookingTimes(b)}` : ""}{b.reference ? ` · ${b.reference}` : ""}{b.startsToday ? ` · ${sv.startsToday}` : ""}</small>
                </span>
                <span className="end"><span className={statusBadge(b.status)}>{sv.badge[b.status]}</span><TicketButton b={b} edit={p.edit} /></span>
              </div>
            );
          }) : <p className="ro">{sv.noBookingsToday}</p>}
        </section>}
        {info && <details className="card sec lock">{/* closed at first, read-only (UP-15) */}
          <summary><h3>{sv.info}</h3></summary>
          {t.info.map((x) => <div className="row mid" key={x.id}><InfoText t={t} x={x} onPlace={p.place} /></div>)}
        </details>}
      </div>}
    </div>
  </>;
}

type Day = Trip["days"][number];

/** The time of day in the trip's time zone, updated every half minute while the shown day is today (UP-29). */
function useClock(timeZone: string, on: boolean) {
  const [now, setNow] = useState(() => clockIn(timeZone));
  useEffect(() => {
    if (!on) return;
    setNow(clockIn(timeZone));
    const id = setInterval(() => setNow(clockIn(timeZone)), 30_000);
    return () => clearInterval(id);
  }, [timeZone, on]);
  return on ? now : undefined;
}

/** The currency of the day's country (UP-23). A day without a country is looked up once on this device (UP-24),
 * and the rate is fetched ahead, so the expense form also works without a network later (UP-25). */
function useDayCurrency(day: Day, tripCurrency: string, today: string) {
  const [kept, setKept] = useState(keptCountries);
  const currency = currencyFor(dayCountry(day, kept), tripCurrency);
  useEffect(() => {
    if (day.country || !day.location || kept[day.location] || !navigator.onLine) return;
    lookupCountry(day.location, geocodeUrl(day.location)).then((c) => c && setKept(keptCountries()));
  }, [day.location, day.country]); // eslint-disable-line react-hooks/exhaustive-deps -- once per location
  useEffect(() => { if (currency !== tripCurrency && navigator.onLine) void rateFor(currency, tripCurrency, today); }, [currency, tripCurrency, today]);
  return currency;
}

/** The day as a timeline of cards that do not fold out, all alike, with a line for the clock (UP-16, UP-27..UP-33). */
function Timeline({ p, day, add }: { p: TripViewProps; day: Day; add: boolean }) {
  const { t } = p;
  const now = useClock(t.timezone, day.date === p.today);
  const at = nowAt(day.activities, now), clash = clashes(day.activities), who = hiddenFromIn(day);
  const currency = useDayCurrency(day, t.currency, p.today);
  const line = now && <li className="nowline" key="now"><span>{sv.up.now} {now.replace(":", ".")}</span></li>;
  return <ol className="upday">
    {day.activities.map((a, i) => {
      const c = clash.get(a.id), b = ticketFor(t, a.id), place = a.placeIds[0], dur = durationText(a, false); // UP-36
      const hid = who.get(a.id), eye = p.edit && (() => p.edit({ kind: "hidden", dayId: day.id, id: a.id }));
      const card = <li key={a.id} className={`card upact ${c ? "warn" : ""} ${hid ? "hiddenrow" : ""}`}>
        {hid && <span className="upeye"><Eye t={t} who={hid} open={eye} /></span> /* top right, not in the title (UP-32) */}
        <span className="upwhen">
          <time>{upTime(a)}</time>
          {a.category && <CatIcon id={a.category} />}
        </span>
        <span className="upbody">
          <ActivityText t={t} a={a} onPlace={p.place} />
          {dur && <small className="ro">{dur}</small>}
          {c && <small className="clash"><Icon name="alert" />{sv.up.clash(c.end, c.with.text, c.with.start!)}</small>}
          <span className="upbtns">
            {place && <IconButton icon="map" look="bare" tip="left" label={`${sv.up.place}: ${t.places.find((x) => x.id === place)?.name ?? a.text}`} onClick={() => p.place(place)} />}
            {b && <TicketButton b={b} edit={p.edit} />}
            {add && !a.hidden && <IconButton icon="money" look="bare" tip="left" label={sv.up.expenseTitle(a.text)}
              onClick={() => p.addShortExpense(currency, { id: a.id, text: a.text, category: a.category })} />}
          </span>
        </span>
      </li>;
      return i === at ? [line, card] : card;
    })}
    {at === day.activities.length && line}
    {add && <li><button className="addrow" onClick={() => p.addShortExpense(currency)}><Icon name="banknote" /><span>{sv.addExpense}</span><Icon name="plus" /></button></li>}
  </ol>;
}
