// Pure display logic. Kept free of React so it runs under node --test.
import { sv } from "./sv.ts";
import { secretsOf, textHiddenFrom, whoFor } from "@trip/schema/src/hidden.ts";

type DayLike = { id: string; date: string; start: string; end: string; estimated: boolean; startEstimated?: boolean; endEstimated?: boolean; location?: string };
type Vehicle = "car" | "ferry" | "train" | "transit" | "walk";
type BudgetLike = { category: string; amount?: number; paid: boolean; estimate?: boolean };
export type Open = Record<string, boolean>;

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};
const hhmm = (t: string) => t.replace(":", ".");
const ca = (t: string, est: boolean | undefined) => (est ? "ca " : "") + hhmm(t);

export const dateBadge = (iso: string) => { const p = parts(iso); return { d: String(p.d), w: sv.weekdays[p.wd] }; };

export const dayTime = (d: DayLike) =>
  `${ca(d.start, d.startEstimated ?? d.estimated)}–${ca(d.end, d.endEstimated ?? d.estimated)}`;

/** Only the start: the next activity's start shows when this one ends (TM-05). */
export const activityTime = (a: { start?: string; estimated: boolean }) => (a.start ? ca(a.start, a.estimated) : "");

export const kr = (n: number) =>
  n.toLocaleString("sv-SE", Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";

const dayMonth = (iso: string) => { const p = parts(iso); return `${p.d} ${sv.months[p.m - 1]}`; };
export const shortDate = (iso: string) => `${dayMonth(iso)} ${parts(iso).y}`;
export const dayLabel = (iso: string) => `${sv.weekdays[parts(iso).wd]} ${dayMonth(iso)}`; // BG-21

/** A date field's text: dd/mm/åååå, whatever the browser's language (LC-05). */
export const dateText = (iso: string) => (/^\d{4}-\d\d-\d\d$/.test(iso) ? iso.split("-").reverse().join("/") : "");
/** A date typed in a date field as an ISO date: d/m/åååå with /, . or -, the eight digits, or 2027-11-01; undefined when it is no date (LC-05). */
export function parseDate(text: string): string | undefined {
  const s = text.trim(), m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s) ?? /^(\d\d)(\d\d)(\d{4})$/.exec(s), iso = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s);
  const [y, mo, d] = iso ? [+iso[1]!, +iso[2]!, +iso[3]!] : m ? [+m[3]!, +m[2]!, +m[1]!] : [0, 0, 0];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : undefined;
}
/** Digits typed in a date field with the slashes put in: "011" is "01/1" (LC-05); other separators are left as typed. */
export function typedDate(text: string): string {
  if (!/^[\d/]*$/.test(text) || text.endsWith("/")) return text;
  const d = text.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
}

export function tripDates(t: { days: { date: string }[]; dateLabel?: string }) {
  if (t.dateLabel) return t.dateLabel;
  if (!t.days.length) return sv.noDates;
  const ds = t.days.map((d) => d.date).sort();
  const last = ds[ds.length - 1];
  return `${dayMonth(ds[0])} – ${dayMonth(last)} ${parts(last).y}`;
}

export const excerpt = (purpose: string) => { const s = purpose || sv.noPurpose; return s.length > 70 ? s.slice(0, 70) + "…" : s; };

export function bookingDates(b: { from: string; to: string }) {
  if (b.from === b.to) return dayMonth(b.from);
  const f = parts(b.from), t = parts(b.to);
  return f.m === t.m ? `${f.d}–${t.d} ${sv.months[t.m - 1]}` : `${dayMonth(b.from)} – ${dayMonth(b.to)}`;
}

/** The times of a booking after its dates: check-in and check-out of a Boende, the start of a Biljett (BK-07). */
export function bookingTimes(b: { kind?: string; name?: string; checkIn?: string; checkOut?: string; start?: string; origin?: string; destination?: string; arrival?: string }) {
  if (b.kind === "transport") { // BK-37: "kl. 14.30 Puttgarden → Rødby, framme 15.15", without the places the name already gives
    const named = !!b.name && [b.origin, b.destination].every((x) => !x || b.name!.includes(x));
    const where = named ? "" : b.origin && b.destination ? `${b.origin} → ${b.destination}` : b.origin ? `${sv.bookingKinds.fromPlace} ${b.origin}` : b.destination ? `${sv.bookingKinds.toPlace} ${b.destination}` : "";
    return [[b.start && `kl. ${hhmm(b.start)}`, where].filter(Boolean).join(" "), b.arrival && `${sv.bookingKinds.arrives} ${hhmm(b.arrival)}`].filter(Boolean).join(", ");
  }
  if (b.kind === "stay") return [b.checkIn && `${sv.bookingKinds.in} ${hhmm(b.checkIn)}`, b.checkOut && `${sv.bookingKinds.out} ${hhmm(b.checkOut)}`].filter(Boolean).join(" · ");
  return b.kind === "ticket" && b.start ? `kl. ${hhmm(b.start)}` : "";
}

const vehicleIcon: Record<Vehicle, string> = { car: "🚗", ferry: "🚢", train: "🚆", transit: "🚇", walk: "🚶" };
export const vehicleIcons = (d: { legs: { vehicle: Vehicle }[] }) =>
  [...new Set(d.legs.map((l) => vehicleIcon[l.vehicle]))].join("");

export const routeLabel = (days: { date: string; location?: string }[]) =>
  [...new Set(days.map((d) => d.location).filter((l): l is string => !!l))].join(" → ");

/** A day title, or "Dold rubrik" when it would give away a hidden activity (AU-27). */
export const dayTitle = (d: { title: string; hiddenTitle?: boolean }) => (d.hiddenTitle ? sv.hiddenTitle : d.title);
type Secrets = Parameters<typeof secretsOf>[0];
type Placed = Secrets & { places: { id: string; name: string; notes?: string }[] };
/** Whom texts are hidden from, for their eye: an activity hidden anywhere in the trip that they resemble, also through the
 * name and notes of a place they link (AU-30). */
export function textWho(t: Placed, texts: (string | undefined)[], placeId?: string) {
  const p = t.places.find((x) => x.id === placeId);
  return whoFor(secretsOf(t), [...texts, p?.name, p?.notes]);
}
/** Whom a text of a day is hidden from: the hidden activities of that day (AU-27) and of the whole trip (AU-30). */
export function dayTextWho(t: Secrets | undefined, d: Parameters<typeof textHiddenFrom>[0], text: string) {
  const out = textHiddenFrom(d, text);
  for (const id of t ? whoFor(secretsOf(t), [text]) : []) if (!out.includes(id)) out.push(id);
  return out;
}
/** Whom the day title is hidden from, for its eye (AU-27, AU-29, AU-30); none when the title already reached the viewer hidden. */
export const titleHiddenFrom = (d: Parameters<typeof textHiddenFrom>[0] & { title: string; hiddenTitle?: boolean }, t?: Secrets) =>
  (d.hiddenTitle ? [] : dayTextWho(t, d, d.title));
/** A timeline label; the server empties one that would give away a hidden activity (AU-27). */
export const stopLabel = (s: { label: string }) => s.label || sv.hiddenTitle;

/** The id of the day whose date is today, for marking its card and timeline stop (DC-15). */
export const todayId = (days: { id: string; date: string }[], today: string) => days.find((d) => d.date === today)?.id;

export function timelineStops<S extends { dayId: string }>(t: { days: { id: string; date: string }[]; stops: S[] }) {
  const date = new Map(t.days.map((d) => [d.id, d.date]));
  return t.stops.filter((s) => date.has(s.dayId)).sort((a, b) => date.get(a.dayId)!.localeCompare(date.get(b.dayId)!));
}

export const paidTotal = (items: BudgetLike[]) => items.filter((i) => i.paid && !i.estimate).reduce((a, i) => a + (i.amount ?? 0), 0);

export function budgetByCategory(items: BudgetLike[]): [string, number][] {
  const g = new Map<string, number>();
  for (const i of items) if (i.amount !== undefined) g.set(i.category, (g.get(i.category) ?? 0) + i.amount);
  return [...g];
}

/** Font size (viewBox units) of the donut total, so it fits the 62-unit hole with a margin; about 0.6 em per character (BG-11). */
export const donutTotalSize = (text: string) => Math.min(10, Math.floor((48 / (0.6 * text.length)) * 10) / 10);

export const anyOpen = (open: Open) => Object.values(open).some(Boolean);
export const toggleOne = (open: Open, id: string): Open => ({ ...open, [id]: !open[id] });
export const toggleAll = (open: Open, ids: string[]): Open => (anyOpen(open) ? {} : Object.fromEntries(ids.map((id) => [id, true])));
export const toggleAllLabel = (open: Open) => (anyOpen(open) ? sv.collapseAll : sv.expandAll);
export const jumpTo = (id: string): Open => ({ [id]: true });
export const scrollBehavior = (reducedMotion: boolean): ScrollBehavior => (reducedMotion ? "auto" : "smooth");

/** The class of a booking's status badge: green when paid or ready (BK-19). */
/** How many bookings are still to book (BK-20, UI-22). */
export const toBook = (t: { bookings: { status: string }[] }) => t.bookings.filter((b) => b.status === "tobook").length;
/** The bookings card's tint: light yellow while something is left to book (BK-34). */
export const bookingsTint = (t: { bookings: { status: string }[] }) => (toBook(t) > 0 ? "caution" : "");
export const statusBadge = (status: string) => (status === "paid" || status === "ready" ? "badge ok" : status === "tobook" ? "badge tobook" : "badge"); // BK-19, BK-20

/** What the app says when an AI feature could not run (AI-03, AI-65). */
/** What the AI added when the trip was made, for the notice when it is done (AI-82). */
export function aiDoneText(n: { activities: number; tasks: number; bookings: number; info?: number; packing?: number }) {
  const d = sv.newTripAi.done, c = { ...n, info: n.info ?? 0, packing: n.packing ?? 0 };
  const parts = ([["activities", d.activities], ["tasks", d.tasks], ["bookings", d.bookings], ["info", d.info], ["packing", d.packing]] as const)
    .filter(([k]) => c[k] > 0).map(([k, w]) => `${c[k]} ${c[k] === 1 ? w[0] : w[1]}`);
  if (!parts.length) return d.nothing;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} och ${parts.at(-1)}` : parts[0]!;
  const one = parts.length === 1 && Object.values(c).reduce((a, b) => a + b, 0) === 1;
  return d.text(list, one, one && c.info === 1); // "kort" is neuter: inlagt
}
export function aiErrorText(r: { error: string; scope?: string }) {
  const e = sv.aiRun.errors;
  return r.error === "cap" ? (r.scope === "account" ? e.capAccount : e.capInstance)
    : r.error === "off" ? e.off : r.error === "refusal" ? e.refusal : r.error === "forbidden" ? e.forbidden : r.error === "network" ? e.network : e.failed;
}
/** A spending cap as typed: a number of USD, undefined for the default when empty, null when it is not a valid amount (AI-03). */
export function capValue(s: string): number | undefined | null {
  const t = s.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
/** One person's AI calls and cost in the usage overview (AI-03). */
export const aiCostLine = (p: { name: string; calls: number; usd: number }) => sv.aiRun.cost(p.name, p.calls, p.usd.toFixed(2).replace(".", ","));
/** Who agreed to send the trip to the AI service, and when (AI-64); "user" is the admin password. */
export const aiConsentLine = (c: { by: string; at: string }) => sv.aiRun.consentBy(c.by === "user" ? sv.aiRun.admin : c.by, shortDate(c.at.slice(0, 10)));

/** Next to a helper's switch: its latest run in the trip's time zone, and about how many runs are left (AI-68, AI-72). */
export function helperLine(s: { at?: string; result?: string; remaining: number }, tz: string) {
  const r = sv.aiRun;
  if (s.result === "cap" || s.remaining <= 0) return r.capped;
  const left = r.left(s.remaining);
  if (!s.at) return `${r.never} · ${left}`;
  const d = new Date(s.at);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  const when = `${dayMonth(day)} ${time}`;
  return `${s.result === "error" ? r.failed(when) : r.last(when) + (s.result === "nothing" ? r.nothing : "")} · ${left}`;
}

/** US-31: the invitation as a mailto link for the phone's own mail app; spaces as %20, which every mail app reads. */
export function inviteMail(x: { to: string; name: string; trip: string; url: string; until: string }) {
  const q = (v: string) => encodeURIComponent(v);
  return `mailto:${q(x.to)}?subject=${q(sv.invite.subject(x.trip))}&body=${q(sv.invite.body(x.name, x.trip, x.url, x.until))}`;
}
/** US-37: the mail to someone who already has an account: they are on the trip, with the login page and no password. */
export function addedMail(x: { to: string; name: string; trip: string; url: string }) {
  const q = (v: string) => encodeURIComponent(v);
  return `mailto:${q(x.to)}?subject=${q(sv.invite.addedSubject(x.trip))}&body=${q(sv.invite.addedBody(x.name, x.trip, x.url))}`;
}
/** AI-91: the earlier trips whose memories the wish helper used, as one line; empty when none. */
export function memoriesLine(titles: string[]) {
  if (!titles.length) return "";
  return sv.fromMemories(titles.length > 1 ? `${titles.slice(0, -1).join(", ")} och ${titles.at(-1)}` : titles[0]!);
}
/** AI-42: a receipt's reading as the expense form's values: the amount as typed in Swedish, only a currency the form offers. */
export function receiptFill(r: { amount?: number; currency?: string; date?: string; text?: string; category?: string }, currencies: string[]) {
  const amount = r.amount === undefined ? undefined : Number.isInteger(r.amount) ? String(r.amount) : r.amount.toFixed(2).replace(".", ",");
  return { ...(amount ? { amount } : {}), ...(r.currency && currencies.includes(r.currency) ? { currency: r.currency } : {}),
    ...(r.date ? { date: r.date } : {}), ...(r.text ? { text: r.text } : {}), ...(r.category ? { category: r.category } : {}) };
}
/** US-34: an answer to one's feedback that came after the dialog was last opened on this device. */
export const newReply = (notes: { replyAt?: string }[], seen: string | null) => notes.some((n) => !!n.replyAt && (!seen || n.replyAt > seen));
/** The line under a traveler's name in the card Vilka som är med: the permission, the login status, and when the traveler does not
 * share costs (AU-40, US-36, MI-38). */
export const travelerLine = (role: "traveler" | "planner", shares: boolean, login: keyof typeof sv.people.login = "none") =>
  [sv.people[role], sv.people.login[login], ...(shares ? [] : [sv.people.noShare])].join(" · ");
