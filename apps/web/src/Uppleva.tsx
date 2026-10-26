// Uppleva: one day of the trip, read-only except for adding expenses (UP-01..UP-13).
import { useEffect, useRef } from "react";
import { bookingDates, bookingTimes, dateBadge, dayTime, dayTitle, kr, stopLabel, timelineStops, titleHiddenFrom, todayId } from "./format.ts";
import { adjacentDay, bookingsOn, budgetStatus, coveringStops, dayHeading, pickDay } from "./today.ts";
import { IconButton } from "./Icons.tsx";
import { Donut, LimitIcon, limitClass } from "./Donut.tsx";
import { atLeast } from "@trip/schema/src/rules.ts";
import { Activities, Eye, HiddenText, InfoText, KindIcon, PlaceLink, TextEye, TicketButton, Weather, type TripViewProps } from "./TripView.tsx";
import { dayIcons } from "./categories.ts";
import { CatIcons, LineIcon } from "./CatIcon.tsx";
import { sv } from "./sv.ts";

export function Uppleva(p: TripViewProps) {
  const { t } = p;
  const day = t.days.find((d) => d.id === p.upDay) ?? pickDay(t.days, p.today);
  const tl = useRef<HTMLDivElement>(null);
  useEffect(() => { // keep the marked stop in view in the sideways scrolling timeline (UP-08)
    const el = tl.current?.querySelector<HTMLElement>(".stop[aria-pressed=true]");
    if (el && tl.current) tl.current.scrollTo({ left: el.offsetLeft - (tl.current.clientWidth - el.offsetWidth) / 2 });
  }, [day?.id]);
  if (!day) return <section className="card"><p className="ro">{sv.noDays}</p></section>;
  const s = budgetStatus(t.budget, t.expenses);
  const bookings = bookingsOn(t.bookings, day.date);
  const marked = new Set(coveringStops(t, day.id).map((n) => t.stops[n]));
  const badge = dateBadge(day.date); // the same date badge as the day cards in Nåla
  const parts = p.perms.view.up, info = p.perms.parts.info !== "hidden" && t.info.length > 0; // practical information as in Nåla (UP-15)
  const side = parts.budget !== "hidden" || parts.bookings !== "hidden" || info; // Uppleva's components (AU-20)
  const canAdd = atLeast(parts.expenses, "add") && (p.perms.superuser || !!p.self); // the superuser and personal links (UP-12, AU-22)
  const spent = p.perms.parts.expenses !== "hidden"; // the sum of expenses only when the role may see expenses somewhere
  const vehicles = [...new Set(day.legs.map((l) => l.vehicle))], now = todayId(t.days, p.today); // UP-14, DC-15
  const titleWho = titleHiddenFrom(day, t); // AU-29, AU-30
  const prev = adjacentDay(t.days, day.id, -1), next = adjacentDay(t.days, day.id, 1);
  return <>
    <div className="tl" ref={tl}>{timelineStops(t).map((x, i) => (
      <button className="stop" key={`${x.dayId}-${i}`} aria-pressed={marked.has(x)} aria-current={x.dayId === now ? "date" : undefined} onClick={() => p.setUpDay(x.dayId)}><b>{stopLabel(x)}</b><small>{x.sub}</small></button>
    ))}</div>
    <div className={`cols ${side ? "" : "one"}`}>
      <div>
        <section className="card">
          <div className="dayhead">
            <div className="daytitle">
              <span className="date" aria-hidden="true"><b>{badge.d}</b><span>{badge.w}</span></span>
              <div>
                {day.date === p.today && <small className="ro" aria-hidden="true">{sv.today}</small>}
                <h3><span className="sr">{dayHeading(day.date, p.today)}: </span>{dayTitle(day)}
                  {titleWho.length > 0 && <Eye t={t} who={titleWho} open={p.edit && (() => p.edit!({ kind: "hidden", dayId: day.id }))} />}</h3>
                <div className="dmeta"><CatIcons ids={dayIcons(day)} /><button className="time when" onClick={() => p.transport(day.id)} aria-label={`${sv.transport}, ${dayTime(day)}`}><LineIcon shape="clock" /> {dayTime(day)}</button></div>
                <Weather forecast={p.forecast[day.id]} big />
              </div>
            </div>
            <span className="daynav">
              {/* A missing day leaves an empty place, so the other button never moves under the pointer (UP-09). */}
              {prev ? <IconButton icon="prev" look="bare" tip="left" label={`${sv.prevDay}: ${dayHeading(prev.date, p.today)}`} onClick={() => p.setUpDay(prev.id)} /> : <span className="navgap" />}
              {next ? <IconButton icon="next" look="bare" tip="left" label={`${sv.nextDay}: ${dayHeading(next.date, p.today)}`} onClick={() => p.setUpDay(next.id)} /> : <span className="navgap" />}
            </span>
          </div>
          {day.activities.length ? <Activities t={t} x={day} onPlace={p.place} edit={p.edit} /> : <p className="ro">{sv.noActivities}</p>}
          {vehicles.length > 0 && <p><button className="badge linkish" onClick={() => p.transport(day.id)}><CatIcons ids={vehicles} /> {sv.travelTime}</button></p>} {/* as in Nåla (UP-14) */}
        </section>
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
              <span className="end">{kr(x.expense.amount)}{x.state === "failed" && <>
                <IconButton icon="refresh" look="bare" tip="left" label={`${sv.queue.retry}: ${String(x.expense.text ?? "")}`} onClick={() => p.retryWaiting(x.expense.id)} />
                <IconButton icon="trash" look="bare" tip="left" label={`${sv.queue.remove}: ${String(x.expense.text ?? "")}`} onClick={() => { if (confirm(sv.queue.removeAsk)) p.removeWaiting(x.expense.id); }} /></>}</span>
            </div>
          ))}
          {/* Not an editing control: the superuser and personal links may add expenses here (UP-07, UP-12). */}
          {canAdd && t.travelers.length > 0 && <div className="add"><IconButton icon="plus" label={sv.addExpense} onClick={p.addExpense} tip="right" /></div>}
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
                <span className="end"><span className={`badge ${b.status === "paid" ? "ok" : ""}`}>{sv.badge[b.status]}</span><TicketButton b={b} edit={p.edit} /></span>
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
