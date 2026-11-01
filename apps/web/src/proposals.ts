// Proposals from an LLM client or the AI, read for review in Nåla (MC-15..MC-18). Pure, so it runs under node --test.
import { applyOps, checkTrip, pinBreaks, Trip, type Op } from "@trip/schema";
import { tripChanges, type Change } from "./changes.ts";
import { sv } from "./sv.ts";
export { previewMarks, tripChanges, type Change, type Mark } from "./changes.ts";

export type Pending = { id: string; baseRevision: number; ops: Op[]; reason: string; status: "pending" | "approved" | "rejected"; at: string; source?: { kind: string } };

/** The pending proposals to review in Nåla; mail stays under Bokningar (MC-15, BK-17). */
export const llmProposals = <P extends { status: string; source?: { kind: string } }>(list: P[]) =>
  list.filter((p) => p.status === "pending" && p.source?.kind !== "mail");

/** A proposal applied to the trip as it is now: the result, its problems (schema and checkTrip) and its changes (MC-16, MC-18). */
export function readProposal(t: Trip, p: Pending): { stale: boolean; problems: string[]; next?: Trip; changes: Change[] } {
  const stale = p.baseRevision !== t.revision; // MC-05: approving it would be refused
  let next: Trip;
  try { next = Trip.parse(applyOps(t, p.ops)); } catch (e) {
    return { stale, problems: [e instanceof Error ? e.message.split("\n")[0] : String(e)], changes: [] };
  }
  return { stale, problems: [...checkTrip(next), ...pinBreaks(t, next).map(sv.proposal.pin)], next, changes: tripChanges(t, next) }; // MC-20
}
