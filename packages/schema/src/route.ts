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
