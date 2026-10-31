// Minnen in Minnas: verdicts and comments on the wishes that came true, kept for planning later trips, and the album link (MI-15..MI-20, MI-26).
import type { Op } from "@trip/schema";
import { sv } from "./sv.ts";

type Wish = { id: string; hidden?: boolean };
type Day = { date: string; activities: { dreamId?: string; hidden?: boolean }[] };
export type Verdict = "again" | "ok" | "never";
export const VERDICTS: Verdict[] = ["again", "ok", "never"];
export type Memory = { id: string; dreamId: string; by: string; verdict?: Verdict; note?: string };

export const MAX_NOTE = 140;
export type MinnasView = "minnen" | "budget";

const VIEW_KEY = "mytrip.minnas";
export const storedView = () => { try { return localStorage.getItem(VIEW_KEY); } catch { return null; } };
export const keepView = (v: MinnasView) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

/** Upplevt when the role may see memories, unless the device remembers Pengar (MI-15). */
export const minnasView = (stored: string | null, memories: boolean): MinnasView =>
  !memories ? "budget" : stored === "budget" ? "budget" : "minnen";

/** The wishes linked to an activity on a day up to today, once each, in Önska's order; hidden ones left out (MI-16). */
export function experienced<W extends Wish>(t: { dreams: W[]; days: Day[] }, today: string) {
  const done = new Set(t.days.filter((d) => d.date <= today).flatMap((d) => d.activities.filter((a) => !a.hidden && a.dreamId).map((a) => a.dreamId!)));
  return t.dreams.filter((w) => done.has(w.id) && !w.hidden);
}

/** How many gave each verdict, never who (MI-18). */
export function verdictCounts(t: { memories: Memory[] }, dreamId: string): Record<Verdict, number> {
  const n = { again: 0, ok: 0, never: 0 };
  for (const m of t.memories) if (m.dreamId === dreamId && m.verdict) n[m.verdict]++;
  return n;
}

/** The comments on a wish without names; the server sends a Resenär only their own (MI-18). */
export const notesOf = (t: { memories: Memory[] }, dreamId: string) => t.memories.filter((m) => m.dreamId === dreamId && m.note).map((m) => m.note!);

export const mineOf = (t: { memories: Memory[] }, dreamId: string, by: string) => t.memories.find((m) => m.dreamId === dreamId && m.by === by);

/** A verdict or comment in one traveler's name; the same verdict again takes it back, and a memory with neither is removed (MI-17). */
export function memoryOps(t: { memories: Memory[] }, dreamId: string, by: string, change: { verdict?: Verdict; note?: string }): { ok: true; ops: Op[] } | { ok: false; error: string } {
  const note = change.note?.trim();
  if (note && note.length > MAX_NOTE) return { ok: false, error: sv.minnas.tooLong(MAX_NOTE) };
  const i = t.memories.findIndex((m) => m.dreamId === dreamId && m.by === by), was = t.memories[i];
  const verdict = change.verdict === undefined ? was?.verdict : change.verdict === was?.verdict ? undefined : change.verdict;
  const kept = change.note !== undefined ? note : was?.note;
  const value: Memory = { id: was?.id ?? `m-${dreamId}-${by}`, dreamId, by, ...(verdict ? { verdict } : {}), ...(kept ? { note: kept } : {}) };
  if (!verdict && !kept) return { ok: true, ops: was ? [{ op: "remove", path: `memories/${i}` }] : [] };
  return { ok: true, ops: [was ? { op: "set", path: `memories/${i}`, value } : { op: "add", path: "memories/-", value }] };
}

/** Sets the album link; empty clears it (MI-20). */
export function saveAlbum(t: { album?: string }, input: string): { ok: true; ops: Op[] } | { ok: false; error: string } {
  const s = input.trim();
  if (!s) return { ok: true, ops: t.album === undefined ? [] : [{ op: "remove", path: "album" }] };
  return albumOk(s) ? { ok: true, ops: [{ op: "set", path: "album", value: s }] } : { ok: false, error: sv.minnas.badAlbum };
}

/** The album link must be an https address (MI-20). */
export function albumOk(s: string) {
  if (!/^https:\/\//.test(s)) return false;
  try { return new URL(s).protocol === "https:"; } catch { return false; }
}
