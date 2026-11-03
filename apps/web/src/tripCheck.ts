// "Kontrollera resan": rule-based checks of the plan, without network or AI (DQ-08, DQ-12). Pure, so it runs under node --test.
import { sv } from "./sv.ts";

export type Finding = { level: "warn" | "caution"; dayId: string; text: string };
type CheckTrip = { days: { id: string; date: string }[]; bookings: { from: string; to: string; status: string; kind?: string }[] };

const next = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
const dm = (iso: string) => ({ d: +iso.slice(8, 10), m: sv.months[+iso.slice(5, 7) - 1] });
/** "1–5 nov", or "31 okt–1 nov" across a month. */
function nights(from: string, to: string) {
  const a = dm(from), b = dm(to);
  return a.m === b.m ? `${a.d}–${b.d} ${b.m}` : `${a.d} ${a.m}–${b.d} ${b.m}`;
}

/** Each night of the trip without a stay, consecutive nights of the same level together: red when nothing covers it, yellow when only
 * a stay still to book does. A stay, an overnight transport or an old booking without a kind covers its nights; the last day's night is at home (DQ-08). */
export function nightFindings(t: CheckTrip): Finding[] {
  const days = [...t.days].sort((a, b) => a.date.localeCompare(b.date)).slice(0, -1);
  const covers = t.bookings.filter((b) => b.status !== "cancelled" && (b.kind === "stay" || b.kind === "transport" || !b.kind));
  const levelOf = (d: string) => {
    const on = covers.filter((b) => b.from <= d && d < b.to);
    return on.some((b) => b.status !== "tobook") ? undefined : on.length ? "caution" as const : "warn" as const;
  };
  const runs: { level: Finding["level"]; dayId: string; first: string; last: string; n: number }[] = [];
  for (const day of days) {
    const level = levelOf(day.date), prev = runs.at(-1);
    if (!level) continue;
    if (prev && prev.level === level && next(prev.last) === day.date) { prev.last = day.date; prev.n++; }
    else runs.push({ level, dayId: day.id, first: day.date, last: day.date, n: 1 });
  }
  return runs.map((r) => {
    const range = nights(r.first, next(r.last));
    return { level: r.level, dayId: r.dayId, text: r.level === "warn" ? sv.check.noStay(range, r.n) : sv.check.toBook(range, r.n) };
  });
}

/** The trip's check as one level: red when anything is serious, yellow when only less serious, else ok. */
export const checkLevel = (f: Finding[]) => (f.some((x) => x.level === "warn") ? "warn" : f.length ? "caution" : "ok");

/** Everything "Kontrollera resan" finds, the serious first (DQ-08; more checks follow). */
export const tripFindings = (t: CheckTrip) => nightFindings(t).sort((a, b) => (a.level === b.level ? 0 : a.level === "warn" ? -1 : 1));
