// "Kontrollera resan": rule-based checks of the plan, without network or AI (DQ-08..DQ-10, DQ-12). Pure, so it runs under node --test.
import { sv } from "./sv.ts";
import { dayLabel } from "./format.ts";
import { activityEnd, toMin } from "./time.ts";
import { fmtDuration } from "./transport.ts";

export type Finding = { level: "warn" | "caution"; dayId: string; text: string };
type CheckTrip = { days: { id: string; date: string }[]; bookings: { from: string; to: string; status: string; kind?: string }[] };
type TimedAct = { text: string; start?: string; end?: string; durationMin?: number; estimated: boolean; travel?: { durationMin: number } };
type TimeTrip = { days: { id: string; date: string; end: string; activities: TimedAct[] }[]; bookings: { name: string; from: string; status: string; kind?: string; checkIn?: string }[] };

/** The least time between two fixed times, the way there counted, until the trip can set its own (DQ-10, DM-15). */
export const BUFFER_MIN = 15;

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

const dot = (time: string) => time.replace(":", ".");
/** Each day's times: a fixed time that cannot be reached after the activity before it ends and the way there (red), an overlap with
 * an approximate time and too little buffer between fixed times (yellow), and a day that ends before its stay's check-in opens (yellow) (DQ-09, DQ-10). */
export function timeFindings(t: TimeTrip): Finding[] {
  const out: Finding[] = [];
  for (const d of t.days) {
    const day = dayLabel(d.date).replace(/^./, (c) => c.toUpperCase()); // first in its sentence
    let latest: { min: number; a: TimedAct } | undefined; // the latest known end so far, as in the schedule (ED-17)
    for (const a of d.activities) {
      if (!a.start) continue;
      const name = a.text || sv.hiddenActivity, way = a.travel?.durationMin ?? 0;
      if (latest) {
        const spare = toMin(a.start) - latest.min - way, before = latest.a.text || sv.hiddenActivity, end = dot(activityEnd(latest.a)!);
        if (spare < 0) out.push(a.estimated ? { level: "caution", dayId: d.id, text: sv.check.lateCa(day, name, dot(a.start), before, end) }
          : { level: "warn", dayId: d.id, text: sv.check.late(day, name, dot(a.start), before, end, way ? fmtDuration(way) : undefined) });
        else if (spare < BUFFER_MIN && !a.estimated && !latest.a.estimated) out.push({ level: "caution", dayId: d.id, text: sv.check.buffer(day, name, dot(a.start), fmtDuration(spare)) });
      }
      const end = activityEnd(a);
      latest = end ? (latest && latest.min > toMin(end) ? latest : { min: toMin(end), a }) : undefined;
    }
    for (const b of t.bookings)
      if (b.from === d.date && b.status !== "cancelled" && b.kind === "stay" && b.checkIn && toMin(d.end) < toMin(b.checkIn))
        out.push({ level: "caution", dayId: d.id, text: sv.check.checkIn(day, b.name, dot(b.checkIn), dot(d.end)) });
  }
  return out;
}

/** The trip's check as one level: red when anything is serious, yellow when only less serious, else ok. */
export const checkLevel = (f: Finding[]) => (f.some((x) => x.level === "warn") ? "warn" : f.length ? "caution" : "ok");

/** Everything "Kontrollera resan" finds: the serious first, then by day (DQ-08..DQ-10). */
export function tripFindings(t: CheckTrip & TimeTrip): Finding[] {
  const order = new Map([...t.days].sort((a, b) => a.date.localeCompare(b.date)).map((d, i) => [d.id, i]));
  return [...nightFindings(t), ...timeFindings(t)].sort((a, b) => (a.level === b.level ? 0 : a.level === "warn" ? -1 : 1) || order.get(a.dayId)! - order.get(b.dayId)!);
}
