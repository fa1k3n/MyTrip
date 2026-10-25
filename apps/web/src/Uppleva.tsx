// Uppleva: one day of the trip, read-only except for adding expenses (UP-01..UP-13).
import { useEffect, useRef } from "react";
import { bookingDates, dateBadge, dayTime, kr, timelineStops } from "./format.ts";
import { adjacentDay, bookingsOn, budgetStatus, coveringStops, dayHeading, pickDay } from "./today.ts";
import { IconButton } from "./Icons.tsx";
import { Donut, LimitIcon, limitClass } from "./Donut.tsx";
import { atLeast } from "@trip/schema/src/rules.ts";
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
  const badge = dateBadge(day.date); // the same date badge as the day cards in Nåla
  const parts = p.perms.view.up, side = parts.budget !== "hidden" || parts.bookings !== "hidden"; // Uppleva's components (AU-20)
  const canAdd = atLeast(parts.expenses, "add") && (p.perms.superuser || !!p.self); // the superuser and personal links (UP-12, AU-22)
  const spent = p.perms.parts.expenses !== "hidden"; // the sum of expenses only when the role may see expenses somewhere
  const prev = adjacentDay(t.days, day.id, -1), next = adjacentDay(t.days, day.id, 1);
  return <>
    <div className="tl" ref={tl}>{timelineStops(t).map((x, i) => (
      <button className="stop" key={`${x.dayId}-${i}`} aria-pressed={marked.has(x)} onClick={() => p.setUpDay(x.dayId)}><b>{x.label}</b><small>{x.sub}</small></button>
    ))}</div>
    <div className={`cols ${side ? "" : "one"}`}>
      <div>
        <section className="card">
          <div className="dayhead">
            <div className="daytitle">
              <span className="date" aria-hidden="true"><b>{badge.d}</b><span>{badge.w}</span></span>
              <div>
                {day.date === p.today && <small className="ro" aria-hidden="true">{sv.today}</small>}
                <h3><span className="sr">{dayHeading(day.date, p.today)}: </span>{day.title}</h3>
                <div className="dmeta"><CatIcons ids={dayIcons(day)} /><span className="time"><LineIcon shape="clock" /> {dayTime(day)}</span></div>
                <Weather forecast={p.forecast[day.id]} big />
              </div>
            </div>
            <span className="daynav">
              {/* A missing day leaves an empty place, so the other button never moves under the pointer (UP-09). */}
              {prev ? <IconButton icon="prev" look="bare" tip="left" label={`${sv.prevDay}: ${dayHeading(prev.date, p.today)}`} onClick={() => p.setUpDay(prev.id)} /> : <span className="navgap" />}
              {next ? <IconButton icon="next" look="bare" tip="left" label={`${sv.nextDay}: ${dayHeading(next.date, p.today)}`} onClick={() => p.setUpDay(next.id)} /> : <span className="navgap" />}
            </span>
          </div>
          {day.activities.length ? <Activities t={t} x={day} onPlace={p.place} /> : <p className="ro">{sv.noActivities}</p>}
        </section>
      </div>
      {side && <div>{/* budget and bookings, if the role may see them (AU-17, AU-21) */}
        {parts.budget !== "hidden" && <section className={`card ${limitClass(t)}`}>
          <div className="sechead"><h3>{sv.budgetStatus}</h3><LimitIcon t={t} big /></div>
          <Donut t={t} />
          <div className="row"><span>{sv.paidAhead}</span><span>{kr(s.paid)}</span></div>
          <div className="row"><span>{sv.leftToPay}</span><span>{kr(s.left)}</span></div>
          {spent && <div className="row"><span>{sv.spentOnTrip}</span><span>{kr(s.spent)}</span></div>}
          {/* Not an editing control: the superuser and personal links may add expenses here (UP-07, UP-12). */}
          {canAdd && t.travelers.length > 0 && <div className="add"><IconButton icon="plus" label={sv.addExpense} onClick={p.addExpense} tip="right" /></div>}
        </section>}
        {parts.bookings !== "hidden" && <section className="card">
          <h3>{sv.ticketsToday}</h3>
          {bookings.length ? bookings.map((b) => {
            return (
              <div className="row mid" key={b.id}>
                <span>
                  <PlaceLink t={t} id={b.placeId} text={b.name} onPlace={p.place} /><br />
                  <small className="ro">{bookingDates(b)}{b.reference ? ` · ${b.reference}` : ""}{b.startsToday ? ` · ${sv.startsToday}` : ""}</small>
                </span>
                <span className="end"><span className={`badge ${b.status === "paid" ? "ok" : ""}`}>{sv.badge[b.status]}</span></span>
              </div>
            );
          }) : <p className="ro">{sv.noBookingsToday}</p>}
        </section>}
      </div>}
    </div>
  </>;
}
