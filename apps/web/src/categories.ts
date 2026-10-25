// One list of categories, shared by wishes and activities (DB-04), and the day icons derived from it (DC-14).
// The icons themselves are drawn by CatIcon.tsx; here a category's icon id is its name.

export const CATEGORIES = [
  { name: "Mat" }, { name: "Utsikt" }, { name: "Aktivitet" }, { name: "Avkoppling" }, { name: "Museum" },
  { name: "Bad" }, { name: "Shopping" }, { name: "Natur" }, { name: "Resa" },
] as const;

const NAMES: readonly string[] = CATEGORIES.map((c) => c.name);
/** The icon id of a category, or undefined for a category outside the list. */
export const categoryIcon = (name: string): string | undefined => (NAMES.includes(name) ? name : undefined);

const VEHICLES = ["car", "ferry", "train"];
const TRAVEL_MIN = 120; // a day with at least two hours of motorised travel is a travel day

type DayLike = { icons: string[]; activities: { category?: string }[]; legs: { vehicle: string; durationMin?: number }[] };

/** Icon ids: the day's main vehicle on travel days, then its most common activity categories; the day's own icons otherwise. */
export function dayIcons(day: DayLike): string[] {
  const minutes = new Map<string, number>();
  for (const l of day.legs) if (VEHICLES.includes(l.vehicle) && l.durationMin) minutes.set(l.vehicle, (minutes.get(l.vehicle) ?? 0) + l.durationMin);
  const travel = [...minutes].reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0] as [string, number]);
  const total = [...minutes.values()].reduce((a, b) => a + b, 0);
  const counts = new Map<string, number>();
  for (const a of day.activities) if (a.category && categoryIcon(a.category)) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c); // stable: ties keep first-seen order
  const icons = [...new Set([...(total >= TRAVEL_MIN ? [travel[0]] : []), ...top])].slice(0, 2);
  return icons.length ? icons : day.icons;
}
