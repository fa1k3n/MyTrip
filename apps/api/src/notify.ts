// What a notice says about a change, described from one receiver's view of the trip (NT-01, NT-02). Pure, so it runs under node --test.
// The texts are the app's own (sv.ts), so the interface text stays in one place.
import { sv } from "../../web/src/sv.ts";
import { dateBadge, kr } from "../../web/src/format.ts";

type Item = { id: string; hidden?: boolean };
type Act = Item & { text: string; start?: string; end?: string; note?: string; placeIds?: string[] };
type View = {
  days: { id: string; date: string; activities: Act[] }[];
  expenses: (Item & { text: string; amount: number; pending?: boolean })[];
  bookings: (Item & { name: string })[]; tasks: (Item & { text: string })[]; info: (Item & { title: string })[];
  dreams: (Item & { title: string })[]; payments: (Item & { amount: number })[];
};

const added = <T extends Item>(a: T[], b: T[], hidden = false) => b.filter((x) => (hidden || !x.hidden) && !a.some((y) => y.id === x.id));
const dayText = (date: string) => { const b = dateBadge(date); return `${b.w} ${b.d} ${sv.months[Number(date.slice(5, 7)) - 1]}`; };
const sameAct = (a: Act, b: Act) => a.text === b.text && a.start === b.start && a.end === b.end && a.note === b.note && (a.placeIds ?? []).join() === (b.placeIds ?? []).join();

/** One line per thing changed, in the receiver's view: hidden things and changes they cannot see give no line (NT-02). */
export function describeChange(before: View, after: View, who: string): string[] {
  const n = sv.notice, out: string[] = [];
  for (const e of added(before.expenses, after.expenses, true)) // a hidden one is told by its amount only, as Summera shows it (AU-30)
    out.push(n.expense(who, (e.text ? `${e.text}, ` : "") + kr(e.amount)) + (e.pending ? n.waits : ""));
  for (const e of before.expenses.filter((x) => x.pending && !x.hidden)) {
    const now = after.expenses.find((x) => x.id === e.id);
    if (!now) out.push(n.rejected(who, e.text)); // MI-11
    else if (!now.pending) out.push(n.approved(who, e.text));
  }
  for (const d of after.days) {
    const old = before.days.find((x) => x.id === d.id)?.activities ?? [];
    for (const a of d.activities.filter((x) => !x.hidden)) {
      const was = old.find((x) => x.id === a.id);
      if (!was) out.push(n.added(who, a.text, dayText(d.date)));
      else if (!was.hidden && !sameAct(was, a)) out.push(n.changed(who, a.text, dayText(d.date)));
    }
    for (const a of old.filter((x) => !x.hidden && !d.activities.some((y) => y.id === x.id))) out.push(n.removed(who, a.text, dayText(d.date)));
  }
  for (const b of added(before.bookings, after.bookings)) out.push(n.booking(who, b.name));
  for (const k of added(before.tasks, after.tasks)) out.push(n.task(who, k.text));
  for (const i of added(before.info, after.info)) out.push(n.info(who, i.title));
  for (const w of added(before.dreams, after.dreams)) out.push(n.dream(who, w.title));
  for (const p of added(before.payments, after.payments)) out.push(n.payment(who, kr(p.amount)));
  return out;
}

/** At most three lines in one notice (NT-01). */
export const noticeBody = (lines: string[]) =>
  (lines.length > 3 ? [...lines.slice(0, 3), sv.notice.more(lines.length - 3)] : lines).join("\n");
