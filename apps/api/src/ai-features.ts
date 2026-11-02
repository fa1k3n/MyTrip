// The AI features of the app, each a fixed action (AI-65); the helpers run by themselves behind a switch (AI-68, AI-69).
import type { Op, Trip } from "@trip/schema";
import type { AiFeature } from "./ai.ts";

const valueOf = (o: Op) => (o.value && typeof o.value === "object" ? (o.value as Record<string, unknown>) : {});

const isBooking = (o: Op) => o.path === "bookings/-";

/** Bra att veta inför resan: rules, documents and things to order before the trip, as tasks (AI-70); what must be booked, as bookings to book (BK-21). */
const prep: AiFeature = {
  area: "suggestions", web: true,
  instructions: `Your job: list what this family must know or do before this trip that is easy to miss.
Cover the whole route, including every country driven through: environmental zones and their stickers (for example the German Umweltplakette),
road tolls, vignettes, bridge and tunnel fees, mandatory car equipment, ferry rules; documents (passports or id cards for children,
consent for travelling with only one parent, the European health insurance card); things that must be booked or ordered in advance;
and practical matters such as power plugs, currency and cash. Use web search to check current rules and give each one its official or best source.
Leave out what does not apply to this trip, its means of transport or its travelers' ages. At most 10 tasks, the most important first.
What must be booked ahead and is not among the trip's bookings yet (a hotel the description asks for, tickets, a ferry crossing, a table)
is a booking to book, not a task: at most 4, only what the trip clearly needs.`,
  task: `Propose the tasks with add operations on tasks/-. Each task: { id, text, done: false, url, due? }. text: one short Swedish sentence
saying what to do, for example "Beställ miljödekal (Umweltplakette) till bilen". url: the source. due: the last sensible day (YYYY-MM-DD)
when it must be ordered or booked ahead, counted back from the trip's first day; leave it out otherwise.
Propose each booking to book with an add operation on bookings/-: { id, name (short Swedish name, for example "Hotell med pool i Hamburg"),
kind: stay|ticket|transport|other, from and to (YYYY-MM-DD, days of the trip it is for), status: "tobook", url (where it is booked) }.`,
  allows: (o) => o.op === "add" && (o.path === "tasks/-" || isBooking(o)),
  helper: {
    fingerprint: (t: Trip) => JSON.stringify({
      purpose: t.purpose, ages: t.travelers.map((x) => x.age ?? null),
      days: t.days.map((d) => [d.date, d.location ?? "", d.country ?? "", d.legs.map((l) => [l.vehicle, l.origin, l.destination])]),
    }),
    known: (t: Trip) => [...t.tasks.map((k) => k.text), ...t.bookings.map((b) => b.name)],
    textOf: (o) => String(valueOf(o).text ?? valueOf(o).name ?? ""),
    finish: (o) => ({ ...o, value: isBooking(o) ? { ...valueOf(o), status: "tobook", ai: true } : { ...valueOf(o), done: false, ai: true } }),
  },
};

/** The icon ids a day may have: the categories and the means of transport the app draws (ICONS in apps/web/src/CatIcon.tsx, UI-08). */
const DAY_ICONS = ["Mat", "Utsikt", "Aktivitet", "Avkoppling", "Museum", "Bad", "Shopping", "Natur", "Resa", "car", "ferry", "train", "transit", "walk"];
/** A day's icons as the app can draw them: others, such as emoji, become the day's means of transport, or Resa (AI-10). */
const tidyDay = (o: Op): Op => {
  if (o.op !== "add" || o.path !== "days/-") return o;
  const v = valueOf(o), legs = Array.isArray(v.legs) ? (v.legs as { vehicle?: unknown }[]) : [];
  const icons = (Array.isArray(v.icons) ? v.icons : []).map(String).filter((x) => DAY_ICONS.includes(x)).slice(0, 2);
  const fallback = legs.map((l) => String(l.vehicle)).find((x) => DAY_ICONS.includes(x)) ?? "Resa";
  return { ...o, value: { ...v, icons: icons.length ? icons : [fallback], aiTitle: true } }; // AI-86
};

/** A draft of a new trip from "Beskriv din dröm", the trip's purpose: title, travelers and days, as one proposal (AI-10). */
const draft: AiFeature = {
  area: "changes",
  instructions: `Your job: turn the travelers' description of their dream trip, the trip's purpose, into a first draft of the trip.
The trip is new and nearly empty. Give it a short Swedish title. Add the travelers the description mentions, with ages when given:
use names only when the description gives them, otherwise names like "Vuxen 1" or "Barn (7 år)". Place the trip in time: use <today> to turn
"höstlovet", "i sommar" or a week number into real dates in the future, and pick a sensible length when none is given.
Add one day per date with where it is spent, and the legs between places with their means of transport.
Respect limits the description gives, such as hours of driving per day, and mention them in the day's summary.
Do not add activities, bookings or wishes: the family adds those themselves.`,
  task: `Propose the draft: set title; add travelers/- for each traveler as { id, name, age?, packing: [] };
add days/- for each day as { id, date: "YYYY-MM-DD", title (a short Swedish title of at most 40 characters saying what the day holds, its travel and
what it is about, for example "Färjan till Rostock" or "Lugn dag vid Alster"; never only the town's name or "Transport mot <town>"), summary (one Swedish sentence without clock times),
icons (one or two of exactly these ids, never emoji: ${DAY_ICONS.join(", ")}; the means of transport on travel days, otherwise what the day is mostly about, or Resa),
start: "09:00", end: "18:00", location (the town), legs: [{ vehicle: car|ferry|train|transit|walk, origin, destination, durationMin? }], activities: [] };
and add stops/- for the timeline as { label (the town), sub (a few words), dayId } where the trip moves to a new place.`,
  allows: (o) => (o.op === "set" && o.path === "title") || (o.op === "add" && ["travelers/-", "days/-", "stops/-"].includes(o.path)),
  tidy: tidyDay,
  applyToNew: true, // AI-78
};

const WISH_CATEGORIES = ["Mat", "Utsikt", "Aktivitet", "Avkoppling", "Museum", "Bad", "Shopping", "Natur"];
const ON_DAY = /^days\/\d+\/activities\/-$/, TITLE = /^days\/(\d+)\/title$/;
/** Förslag på önskningar: real places that suit the trip, each with an activity on a day that fits it (AI-71, AI-77). */
const wishes: AiFeature = {
  area: "suggestions", web: true,
  instructions: `Your job: suggest 5 to 8 real places or activities that this family would love on this trip: follow what the purpose says they love,
the places where the days are spent and the travelers' ages. Use web search to find real places that are open at the time of the trip, each with its official page.
Put each on a day spent in or near the place, fitting the day's pace: nothing on a long travel day, at most two on a day, and not on a day that is already full.
Give every activity an estimated start time that fits the day's start and end, the activities already on the day and the travel to it,
and the way there from the place before (the previous activity, or where the day starts): walking, public transport or car, with a realistic duration.`,
  task: `For each suggestion add three operations, the wish first:
add dreams/- with { id, title (the place's name, short), category (one of ${WISH_CATEGORIES.join(", ")}), url (its official page) };
then add days/<index>/activities/- on the day it fits, with { id, text (a short Swedish title), dreamId (the wish's id), placeIds: [the place's id],
category (the same), start (HH:MM, estimated), durationMin (a sensible length), travel: { vehicle: walk|transit|car|train|ferry, durationMin } };
then add places/- with { id, name, address (street, postcode and town), website (its official page), phone (when found),
notes (opening hours on those dates and other practical facts in one or two Swedish sentences, when found) }.
List the day's suggestions in the order of their start times.
For each day you put activities on whose aiTitle is true, also set days/<index>/title to a short Swedish title of at most 40 characters that sums up
the day's activities and travel, for example "Hagenbeck och hamnrundtur"; never only the town's name.`,
  allows: (o) => (o.op === "add" && (o.path === "dreams/-" || o.path === "places/-" || ON_DAY.test(o.path))) || (o.op === "set" && TITLE.test(o.path)),
  tidy: (o) => (o.path === "dreams/-" ? { ...o, value: { source: "AI-hjälpen", icon: "✨", votes: 0, ...valueOf(o) } }
    : ON_DAY.test(o.path) ? { ...o, value: { estimated: true, ...valueOf(o) } } : o),
  helper: {
    fingerprint: (t: Trip) => JSON.stringify({
      purpose: t.purpose, ages: t.travelers.map((x) => x.age ?? null), places: t.places.map((p) => p.name),
      days: t.days.map((d) => [d.date, d.location ?? ""]),
    }),
    known: (t: Trip) => t.dreams.map((w) => w.title),
    textOf: (o) => String(valueOf(o).title ?? valueOf(o).text ?? ""),
    finish: (o) => (o.path === "dreams/-" ? { ...o, value: { ...valueOf(o), source: "AI-hjälpen", icon: "✨", votes: 0, ai: true } }
      : ON_DAY.test(o.path) ? { ...o, value: { ...valueOf(o), estimated: true, ai: true } } : o),
    group: (ops, t) => {
      const titled = new Set<string>(); // a day's new title goes with its first suggestion, only for a day with an AI title (AI-86)
      const title = (a: Op) => {
        const day = /^days\/(\d+)\//.exec(a.path)![1]!, o = ops.find((x) => TITLE.exec(x.path)?.[1] === day);
        const v = typeof o?.value === "string" ? o.value.trim() : "";
        if (!o || titled.has(day) || !t?.days[Number(day)]?.aiTitle || !v || v.length > 40) return [];
        titled.add(day);
        return [{ ...o, value: v }];
      };
      return ops.filter((o) => o.path === "dreams/-").flatMap((w) => { // a wish without its activity is no whole suggestion; its place goes with it (AI-81)
        const a = ops.find((o) => ON_DAY.test(o.path) && valueOf(o).dreamId === valueOf(w).id);
        const ids = (a && Array.isArray(valueOf(a).placeIds) ? valueOf(a).placeIds as unknown[] : []).map(String);
        return a ? [[w, a, ...ops.filter((o) => o.path === "places/-" && ids.includes(String(valueOf(o).id))), ...title(a)]] : [];
      });
    },
  },
};

export const FEATURES: Record<string, AiFeature> = { prep, wishes, draft };
