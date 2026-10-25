// Proposes a trip purpose from what is planned (MT-11). Rule based; an AI service can later write a richer one (AI-13).
import type { Trip } from "@trip/schema";
import { sv } from "./sv.ts";

type TripLike = Pick<Trip, "travelers" | "places"> & {
  days: { date: string; location?: string; legs: { vehicle: string }[]; activities: { category?: string; placeIds: string[] }[] }[];
};

const vehicleName: Record<string, string> = { car: "bil", ferry: "färja", train: "tåg" };
const categoryPhrase: Record<string, string> = {
  Mat: "god mat", Utsikt: "utsikter", Aktivitet: "aktiviteter", Avkoppling: "avkoppling", Museum: "museer",
  Bad: "bad", Shopping: "shopping", Natur: "natur",
};
/** "a", "a och b", "a, b och c" */
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} och ${xs[xs.length - 1]}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const parts = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d, t: Date.UTC(y, m - 1, d) }; };

function dates(first: string, last: string) {
  const a = parts(first), b = parts(last), month = (m: number) => sv.monthsLong[m - 1];
  if (first === last) return `${a.d} ${month(a.m)}`;
  return a.m === b.m ? `${a.d}–${b.d} ${month(a.m)}` : `${a.d} ${month(a.m)}–${b.d} ${month(b.m)}`;
}

export function suggestPurpose(t: TripLike): string | null {
  const days = [...t.days].sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return null;
  const first = days[0].date, last = days[days.length - 1].date;
  const n = Math.round((parts(last).t - parts(first).t) / 86_400_000) + 1;
  const who = t.travelers.map((x) => (x.age ? `${x.name} (${x.age})` : x.name));
  let text = `${n} ${n === 1 ? "dag" : "dagar"}, ${dates(first, last)}${who.length ? `, för ${list(who)}` : ""}.`;

  const vehicles = [...new Set(days.flatMap((d) => d.legs.map((l) => vehicleName[l.vehicle]).filter(Boolean)))];
  const towns = [...new Set(days.map((d) => d.location).filter((l): l is string => !!l))];
  const counts = new Map<string, number>();
  const acts = days.flatMap((d) => d.activities);
  for (const a of acts) if (a.category && categoryPhrase[a.category]) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  const cats = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => categoryPhrase[c]);
  const highlights = [...new Set(acts.filter((a) => a.category && a.category !== "Mat" && a.category !== "Resa")
    .flatMap((a) => a.placeIds.map((id) => t.places.find((p) => p.id === id)?.name).filter((x): x is string => !!x)))].slice(0, 3);

  const how = [vehicles.length ? list(vehicles) : "", towns.length ? `via ${list(towns)}` : ""].filter(Boolean).join(" ");
  const what = [how, cats.length ? `med ${list(cats)}` : ""].filter(Boolean).join(", ");
  if (what) text += ` ${cap(what)}${highlights.length ? ` – bland annat ${list(highlights)}` : ""}.`;
  return text;
}
