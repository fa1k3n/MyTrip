// The day's driving route, shared by the web (map and link) and the API (traffic check). Imported by path so the web does not bundle zod.
type Leg = { vehicle: string; origin: string; destination: string; waypoints: string[] };
export type Route = { origin: string; destination: string; waypoints: string[] };

/** The whole day's route through every leg and waypoint, or null when nobody drives (TR-06, TR-07) or the route is hidden (AU-28). */
export function routeOf(day: { legs: Leg[]; hiddenRoute?: boolean }): Route | null {
  if (day.hiddenRoute) return null;
  if (!day.legs.some((l) => l.vehicle === "car")) return null;
  const points: string[] = [day.legs[0].origin];
  for (const l of day.legs) for (const p of [...l.waypoints, l.destination]) if (p !== points[points.length - 1]) points.push(p);
  return { origin: points[0], destination: points[points.length - 1], waypoints: points.slice(1, -1) };
}

type WayTrip = {
  days: { id: string; date: string; activities: { id: string; placeIds: string[]; start?: string; travel?: { vehicle: string } }[] }[];
  places: { id: string; name: string; address?: string }[];
  bookings: { kind?: string; status?: string; placeId?: string; from: string; to: string }[];
};
/** The ends of the way to an activity: its first place, from the first place of the nearest activity before it on the day that has
 * one, else the stay of the night before, else none, so the phone's position is used (TR-21, TR-23). Undefined without a place. */
export function wayEnds(t: WayTrip, dayId: string, activityId: string) {
  const day = t.days.find((d) => d.id === dayId), i = day?.activities.findIndex((a) => a.id === activityId) ?? -1;
  const a = day?.activities[i], place = (id?: string) => (id ? t.places.find((x) => x.id === id) : undefined), text = (id?: string) => { const p = place(id); return p ? `${p.name}, ${p.address}` : undefined; };
  const to = text(a?.placeIds[0]);
  if (!day || !a || !to) return undefined;
  const before = day.activities.slice(0, i).reverse().find((x) => x.placeIds.length)?.placeIds[0];
  const stay = t.bookings.find((b) => b.kind === "stay" && b.status !== "cancelled" && b.placeId && b.from < day.date && b.to >= day.date)?.placeId;
  const from = text(before) ?? text(stay), fromName = (place(before) ?? place(stay))?.name; // TR-27: the name shown as where the trip starts
  return { to, ...(from ? { from, fromName } : {}), vehicle: a.travel?.vehicle, date: day.date, ...(a.start ? { start: a.start } : {}) };
}
