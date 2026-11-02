// The AI features of the app, each a fixed action (AI-65); the helpers run by themselves behind a switch (AI-68, AI-69).
import type { Op, Trip } from "@trip/schema";
import type { AiFeature } from "./ai.ts";

const valueOf = (o: Op) => (o.value && typeof o.value === "object" ? (o.value as Record<string, unknown>) : {});

/** Bra att veta inför resan: rules, documents and things to order before the trip, as tasks (AI-70). */
const prep: AiFeature = {
  area: "suggestions", web: true,
  instructions: `Your job: list what this family must know or do before this trip that is easy to miss.
Cover the whole route, including every country driven through: environmental zones and their stickers (for example the German Umweltplakette),
road tolls, vignettes, bridge and tunnel fees, mandatory car equipment, ferry rules; documents (passports or id cards for children,
consent for travelling with only one parent, the European health insurance card); things that must be booked or ordered in advance;
and practical matters such as power plugs, currency and cash. Use web search to check current rules and give each one its official or best source.
Leave out what does not apply to this trip, its means of transport or its travelers' ages. At most 10 tasks, the most important first.`,
  task: `Propose the tasks with add operations on tasks/-. Each task: { id, text, done: false, url, due? }. text: one short Swedish sentence
saying what to do, for example "Beställ miljödekal (Umweltplakette) till bilen". url: the source. due: the last sensible day (YYYY-MM-DD)
when it must be ordered or booked ahead, counted back from the trip's first day; leave it out otherwise.`,
  allows: (o) => o.op === "add" && o.path === "tasks/-",
  helper: {
    fingerprint: (t: Trip) => JSON.stringify({
      purpose: t.purpose, ages: t.travelers.map((x) => x.age ?? null),
      days: t.days.map((d) => [d.date, d.location ?? "", d.country ?? "", d.legs.map((l) => [l.vehicle, l.origin, l.destination])]),
    }),
    known: (t: Trip) => t.tasks.map((k) => k.text),
    textOf: (o) => String(valueOf(o).text ?? ""),
    finish: (o) => ({ ...o, value: { ...valueOf(o), done: false, ai: true } }),
  },
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
add days/- for each day as { id, date: "YYYY-MM-DD", title, summary (one Swedish sentence without clock times), icons (one or two emoji),
start: "09:00", end: "18:00", location (the town), legs: [{ vehicle: car|ferry|train|transit|walk, origin, destination, durationMin? }], activities: [] };
and add stops/- for the timeline as { label (the town), sub (a few words), dayId } where the trip moves to a new place.`,
  allows: (o) => (o.op === "set" && o.path === "title") || (o.op === "add" && ["travelers/-", "days/-", "stops/-"].includes(o.path)),
};

export const FEATURES: Record<string, AiFeature> = { prep, draft };
