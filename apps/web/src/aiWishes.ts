// The wish helper's suggestions, read for Önska and Nåla's day cards (AI-71, AI-77). Pure, so it runs under node --test.
import type { Op, Trip } from "@trip/schema";

type Activity = Trip["days"][number]["activities"][number];
export type WishProposal = { id: string; status: string; ops: Op[]; source?: { kind: string; feature?: string; item?: boolean; day?: string } };
/** One suggestion: the wish it adds, the activity that comes with it and the day that is for. */
export type WishSuggestion = { id: string; wish: Trip["dreams"][number]; activity?: Partial<Activity> & { text: string }; day?: string };

export function wishSuggestion(p: WishProposal): WishSuggestion | undefined {
  const w = p.ops.find((o) => o.path === "dreams/-")?.value as Trip["dreams"][number] | undefined;
  if (!w) return undefined;
  const a = p.ops.find((o) => /^days\/\d+\/activities\/-$/.test(o.path))?.value as WishSuggestion["activity"];
  return { id: p.id, wish: w, ...(a ? { activity: a } : {}), ...(p.source?.day ? { day: p.source.day } : {}) };
}
/** The pending ones, or only those for one day. */
export const wishSuggestions = (list: WishProposal[], day?: string) => list
  .filter((p) => p.status === "pending" && p.source?.kind === "ai" && p.source.feature === "wishes" && p.source.item)
  .map(wishSuggestion).filter((s): s is WishSuggestion => !!s && (!day || s.day === day));
