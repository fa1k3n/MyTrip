// Proposals from an LLM client or the AI, read for review in Nåla (MC-15..MC-18). Pure, so it runs under node --test.
import { applyOps, checkTrip, pinBreaks, Trip, type Op } from "@trip/schema";
import { tripChanges, type Change } from "./changes.ts";
import { sv } from "./sv.ts";
import { dayLabel } from "./format.ts";
import { fmtDuration } from "./transport.ts";
export { previewMarks, tripChanges, type Change, type Mark } from "./changes.ts";

export type Pending = { id: string; baseRevision: number; ops: Op[]; reason: string; status: "pending" | "approved" | "rejected"; at: string; source?: { kind: string; feature?: string; item?: boolean } };
type Sourced = { status: string; source?: { kind: string; feature?: string; item?: boolean } };

/** The pending proposals to review in Nåla; mail stays under Bokningar, a helper's suggestions in their list (MC-15, BK-17, AI-70). */
export const llmProposals = <P extends Sourced>(list: P[]) =>
  list.filter((p) => p.status === "pending" && p.source?.kind !== "mail" && !p.source?.item);
/** A helper's pending suggestions, one proposal each (AI-70). */
export const aiSuggestions = <P extends Sourced>(list: P[], feature: string) =>
  list.filter((p) => p.status === "pending" && p.source?.kind === "ai" && p.source.item && p.source.feature === feature);

/** A proposal applied to the trip as it is now: the result, its problems (schema and checkTrip) and its changes (MC-16, MC-18). */
export function readProposal(t: Trip, p: Pending): { stale: boolean; problems: string[]; next?: Trip; changes: Change[] } {
  const stale = p.baseRevision !== t.revision; // MC-05: approving it would be refused
  let next: Trip;
  try { next = Trip.parse(applyOps(t, p.ops)); } catch (e) {
    return { stale, problems: [e instanceof Error ? e.message.split("\n")[0] : String(e)], changes: [] };
  }
  return { stale, problems: [...checkTrip(next), ...pinBreaks(t, next).map(sv.proposal.pin)], next, changes: tripChanges(t, next) }; // MC-20
}

/** A draft trip in words for its dialog: the title, the travelers with ages and one line per day with its legs (AI-75). */
export function draftSummary(next: Trip) {
  const legs = (d: Trip["days"][number]) => d.legs.map((l) => { // the route only when the day's title does not already say it
    const route = `${l.origin}–${l.destination}`;
    return [sv.newTripAi.vehicles[l.vehicle], d.title === route ? "" : route, l.durationMin ? fmtDuration(l.durationMin) : ""].filter(Boolean).join(" ");
  });
  return {
    title: next.title,
    travelers: next.travelers.map((x) => (x.age !== undefined && !x.name.includes(String(x.age)) ? `${x.name}, ${x.age} år` : x.name)),
    days: [...next.days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => [dayLabel(d.date), d.title, ...legs(d)].join(" · ")),
  };
}
