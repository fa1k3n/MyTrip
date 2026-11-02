// Reviewing what the AI added: keep it (the AI mark goes, AI-02) or remove it at once (AI-83..AI-85). Pure, so it runs under node --test.
import type { Op, Trip } from "@trip/schema";

export type AiItem = { kind: "activity"; dayId: string; id: string } | { kind: "task" | "booking" | "wish" | "info"; id: string }
  | { kind: "packing"; list: string; item: string }; // list: "shared" or a traveler's id (AI-89)

/** The packing lists with their paths: the shared one and each traveler's (AI-89). */
const packLists = (t: Trip) => [{ id: "shared", base: "", l: t as { packing: string[]; packed: string[]; packingAi?: string[] } },
  ...t.travelers.map((x, i) => ({ id: x.id, base: `travelers/${i}/`, l: x as { packing: string[]; packed: string[]; packingAi?: string[] } }))];

/** The items still marked as AI, and the days with AI activities (AI-84). */
export function aiCounts(t: Trip) {
  const days = t.days.filter((d) => d.activities.some((a) => a.ai)).map((d) => d.id);
  return {
    activities: t.days.reduce((n, d) => n + d.activities.filter((a) => a.ai).length, 0),
    tasks: t.tasks.filter((k) => k.ai).length, bookings: t.bookings.filter((b) => b.ai).length, wishes: t.dreams.filter((w) => w.ai).length, days,
    ...(t.info.some((i) => i.ai) && { info: t.info.filter((i) => i.ai).length }), // AI-87
    ...(packLists(t).some((x) => x.l.packingAi?.length) && { packing: packLists(t).reduce((n, x) => n + (x.l.packingAi?.length ?? 0), 0) }), // AI-89
  };
}

const pathOf = (t: Trip, x: AiItem): string | undefined => {
  if (x.kind === "packing") return undefined; // AI-89: marked in a list of its own, not with ai
  if (x.kind === "activity") {
    const di = t.days.findIndex((d) => d.id === x.dayId), ai = t.days[di]?.activities.findIndex((a) => a.id === x.id) ?? -1;
    return ai < 0 ? undefined : `days/${di}/activities/${ai}`;
  }
  const list = { task: "tasks", booking: "bookings", wish: "dreams", info: "info" }[x.kind], i = (t[list as "tasks"] as { id: string }[]).findIndex((y) => y.id === x.id);
  return i < 0 ? undefined : `${list}/${i}`;
};
/** Keeps one item: its AI mark goes, and that of its AI wish or of the wish's AI activities, which belong together (AI-83). */
export function keepAi(t: Trip, x: AiItem): Op[] {
  if (x.kind === "packing") { // AI-89: the item stays, its mark goes
    const p = packLists(t).find((y) => y.id === x.list);
    return p ? [{ op: "set", path: `${p.base}packingAi`, value: (p.l.packingAi ?? []).filter((y) => y !== x.item) }] : [];
  }
  const wish = x.kind === "wish" ? x.id : x.kind === "activity" ? t.days.find((d) => d.id === x.dayId)?.activities.find((a) => a.id === x.id)?.dreamId : undefined;
  const items: AiItem[] = [x, ...(wish ? [
    ...(x.kind !== "wish" && t.dreams.find((w) => w.id === wish)?.ai ? [{ kind: "wish" as const, id: wish }] : []),
    ...t.days.flatMap((d) => d.activities.filter((a) => a.ai && a.dreamId === wish && a.id !== x.id).map((a) => ({ kind: "activity" as const, dayId: d.id, id: a.id }))),
  ] : [])];
  return items.flatMap((y) => { const p = pathOf(t, y); return p ? [{ op: "remove" as const, path: `${p}/ai` }] : []; });
}
/** Behåll allt: every AI mark in the trip goes (AI-84). */
export const keepAllAi = (t: Trip): Op[] => [
  ...[
    ...t.days.flatMap((d, di) => d.activities.flatMap((a, ai) => (a.ai ? [`days/${di}/activities/${ai}`] : []))),
    ...(["tasks", "bookings", "dreams", "info"] as const).flatMap((k) => (t[k] as { ai?: boolean }[]).flatMap((x, i) => (x.ai ? [`${k}/${i}`] : []))),
  ].map((p): Op => ({ op: "remove", path: `${p}/ai` })),
  ...packLists(t).filter((x) => x.l.packingAi?.length).map((x): Op => ({ op: "set", path: `${x.base}packingAi`, value: [] })), // AI-89
];

/** The trip without the given activities and wishes, and without what only they used: an AI wish no other activity makes come true,
 * the AI activities of a removed wish, and places nothing else links (AI-83). Ids are unique in a trip (DM-09), so a quoted id is a link. */
function without(t: Trip, acts: Set<string>, wishes: Set<string>): Trip {
  for (const d of t.days) for (const a of d.activities) if (a.ai && a.dreamId && wishes.has(a.dreamId)) acts.add(a.id);
  const gone = t.days.flatMap((d) => d.activities.filter((a) => acts.has(a.id)));
  const days = t.days.map((d) => ({ ...d, activities: d.activities.filter((a) => !acts.has(a.id)) }));
  const used = new Set(days.flatMap((d) => d.activities.map((a) => a.dreamId)));
  for (const a of gone) if (a.dreamId && t.dreams.find((w) => w.id === a.dreamId)?.ai && !used.has(a.dreamId)) wishes.add(a.dreamId);
  const next = { ...t, days, dreams: t.dreams.filter((w) => !wishes.has(w.id)) };
  const rest = JSON.stringify({ ...next, places: [] });
  const places = gone.flatMap((a) => a.placeIds).filter((p) => !rest.includes(`"${p}"`));
  return { ...next, places: t.places.filter((p) => !places.includes(p.id)) };
}
/** The changes from one trip to the next, list by list, so a removal is one change that Ångra can take back (ED-22). */
const diff = (t: Trip, next: Trip): Op[] => [
  ...next.days.flatMap((d, i) => (d.activities.length !== t.days[i]!.activities.length ? [{ op: "set" as const, path: `days/${i}/activities`, value: d.activities }] : [])),
  ...(["dreams", "places", "tasks", "bookings", "info"] as const).flatMap((k) => (next[k].length !== t[k].length ? [{ op: "set" as const, path: k, value: next[k] }] : [])),
];

/** Removes one AI item at once, with what only it used (AI-83). */
export function removeAi(t: Trip, x: AiItem): Op[] {
  if (x.kind === "packing") { // AI-89: the item goes from its list, its mark and its tick
    const p = packLists(t).find((y) => y.id === x.list), i = p?.l.packing.indexOf(x.item) ?? -1;
    if (!p || i < 0) return [];
    return [{ op: "set", path: `${p.base}packing`, value: p.l.packing.filter((_, j) => j !== i) },
      { op: "set", path: `${p.base}packingAi`, value: (p.l.packingAi ?? []).filter((y) => y !== x.item) },
      { op: "set", path: `${p.base}packed`, value: p.l.packed.filter((y) => y !== x.item) }];
  }
  if (x.kind === "task") return diff(t, { ...t, tasks: t.tasks.filter((k) => k.id !== x.id) });
  if (x.kind === "booking") return diff(t, { ...t, bookings: t.bookings.filter((b) => b.id !== x.id) });
  if (x.kind === "info") return diff(t, { ...t, info: t.info.filter((i) => i.id !== x.id) }); // AI-87
  return diff(t, without(t, new Set(x.kind === "activity" ? [x.id] : []), new Set(x.kind === "wish" ? [x.id] : [])));
}
/** Removes a day's AI activities, with what only they used (AI-85). */
export const removeDayAi = (t: Trip, dayId: string): Op[] =>
  diff(t, without(t, new Set(t.days.find((d) => d.id === dayId)?.activities.filter((a) => a.ai).map((a) => a.id)), new Set()));
