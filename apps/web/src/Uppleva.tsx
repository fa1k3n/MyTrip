// Uppleva: one day of the trip, read-only (UP-01..UP-09).
import { useEffect, useRef } from "react";
import { bookingDates, dayTime, kr, timelineStops } from "./format.ts";
import { adjacentDay, bookingsOn, budgetStatus, coveringStops, dayHeading, pickDay } from "./today.ts";
import { IconButton } from "./Icons.tsx";
import { Activities, PlaceLink, Weather, type TripViewProps } from "./TripView.tsx";
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
  const prev = adjacentDay(t.days, day.id, -1), next = adjacentDay(t.days, day.id, 1);
  return <>
    <div className="tl" ref={tl}>{timelineStops(t).map((x, i) => (
      <button className="stop" key={`${x.dayId}-${i}`} aria-pressed={marked.has(x)} onClick={() => p.setUpDay(x.dayId)}><b>{x.label}</b><small>{x.sub}</small></button>
    ))}</div>
    <div className="cols">
      <div>
        <section className="card">
          <div className="dayhead">
            <h3>{dayHeading(day.date, p.today)}</h3>
            <span className="daynav">
              {prev && <IconButton icon="prev" look="bare" tip="left" label={`${sv.prevDay}: ${dayHeading(prev.date, p.today)}`} onClick={() => p.setUpDay(prev.id)} />}
              {next && <IconButton icon="next" look="bare" tip="left" label={`${sv.nextDay}: ${dayHeading(next.date, p.today)}`} onClick={() => p.setUpDay(next.id)} />}
            </span>
          </div>
          <p className="ro">{day.title} <CatIcons ids={dayIcons(day)} /> · <LineIcon shape="clock" /> {dayTime(day)}</p>
          {day.activities.length ? <Activities t={t} x={day} onPlace={p.place} /> : <p className="ro">{sv.noActivities}</p>}
          <Weather forecast={p.forecast[day.id]} />
        </section>
        <section className="card">
          <h3>{sv.ticketsToday}</h3>
          {bookings.length ? bookings.map((b) => {
            return (
              <div className="row" key={b.id}>
                <span>
                  <PlaceLink t={t} id={b.placeId} text={b.name} onPlace={p.place} /><br />
                  <small className="ro">{bookingDates(b)}{b.reference ? ` · ${b.reference}` : ""}{b.startsToday ? ` · ${sv.startsToday}` : ""}</small>
                </span>
                <span className={`badge ${b.status === "paid" ? "ok" : ""}`}>{sv.badge[b.status]}</span>
              </div>
            );
          }) : <p className="ro">{sv.noBookingsToday}</p>}
        </section>
      </div>
      <div>
        <section className="card">
          <h3>{sv.budgetStatus}</h3>
          <div className="row"><span>{sv.planned}</span><span>{kr(s.planned)}</span></div>
          <div className="row"><span>{sv.paidAhead}</span><span>{kr(s.paid)}</span></div>
          <div className="row"><span>{sv.leftToPay}</span><span>{kr(s.left)}</span></div>
          <div className="row"><span>{sv.spentOnTrip}</span><span>{kr(s.spent)}</span></div>
        </section>
      </div>
    </div>
  </>;
}
