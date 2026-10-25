// Uppleva: one day of the trip, read-only (UP-01..UP-07).
import { bookingDates, dayTime, kr, timelineStops } from "./format.ts";
import { bookingsOn, budgetStatus, dayHeading, pickDay } from "./today.ts";
import { Activities, PlaceLink, Weather, type TripViewProps } from "./TripView.tsx";
import { sv } from "./sv.ts";

export function Uppleva(p: TripViewProps) {
  const { t } = p;
  const day = t.days.find((d) => d.id === p.upDay) ?? pickDay(t.days, p.today);
  if (!day) return <section className="card"><p className="ro">{sv.noDays}</p></section>;
  const s = budgetStatus(t.budget, t.expenses);
  const bookings = bookingsOn(t.bookings, day.date);
  return <>
    <div className="tl">{timelineStops(t).map((x) => (
      <button className="stop" key={x.dayId} aria-pressed={x.dayId === day.id} onClick={() => p.setUpDay(x.dayId)}><b>{x.label}</b><small>{x.sub}</small></button>
    ))}</div>
    <div className="cols">
      <div>
        <section className="card">
          <h3>{dayHeading(day.date, p.today)}</h3>
          <p className="ro">{day.title} {day.icons.join("")} · 🕐 {dayTime(day)}</p>
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
