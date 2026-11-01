// Wishes with a link and an image (DB-05, DB-09); finding and copying the image happen on the server (DB-06..DB-08).
import type { Op } from "@trip/schema";
import { sv } from "./sv.ts";

type Result = { ok: true; ops: Op[] } | { ok: false; error: string };

/** A wish's link: http or https; empty is none (DB-05). */
export function wishUrl(s: string): string | undefined | null {
  const u = s.trim();
  if (!u) return undefined;
  try { return /^https?:$/.test(new URL(u).protocol) ? u : null; } catch { return null; }
}

/** A new wish from the dialog, with an optional link (DB-03, DB-05). */
export function newWish(input: { title: string; category: string; url: string }, id: string): Result {
  const title = input.title.trim(), url = wishUrl(input.url);
  if (!title) return { ok: false, error: sv.errors.title };
  if (url === null) return { ok: false, error: sv.wish.badUrl };
  return { ok: true, ops: [{ op: "add", path: "dreams/-", value: { id, title, category: input.category, source: sv.manual, icon: "✨", votes: 0, ...(url ? { url } : {}) } }] };
}

/** Removing a wish's image marks it as tried, so it is not filled in again automatically (DB-07). */
export const removeImage = (i: number): Op[] => [{ op: "remove", path: `dreams/${i}/image` }, { op: "set", path: `dreams/${i}/imageTried`, value: true }];

/** The wishes to give an image automatically: without one, not tried before and not hidden (DB-07). */
export const toFill = (t: { dreams: { id: string; image?: unknown; imageTried?: boolean; hidden?: boolean }[] }) =>
  t.dreams.filter((w) => !w.image && !w.imageTried && !w.hidden).map((w) => w.id);

type Image = { file: string; kind: "commons" | "own"; page?: string; author?: string; licence?: string; licenceUrl?: string };
/** The image on a wish's card: a Commons image is shown whole, with its credit; an own photo fills the area, without (DB-09). */
export function cardImage(w: { image?: Image }) {
  const i = w.image;
  if (!i) return undefined;
  if (i.kind === "own") return { file: i.file, whole: false };
  return { file: i.file, whole: true, credit: { ...(i.author ? { author: i.author } : {}), licence: i.licence ?? "", ...(i.licenceUrl ? { licenceUrl: i.licenceUrl } : {}), page: i.page ?? "" } };
}

/** A Commons image gets a small mark on the card; its credit lives in the detail view (DB-09, DB-15). */
export const creditMark = (w: { image?: Image }) => w.image?.kind === "commons";

type Wish = { title: string; category: string; source: string; url?: string; image?: Image; hidden?: boolean };
/** What the wish's detail view shows, every image whole; nothing for a hidden wish (DB-15). */
export function wishDetail(w: Wish) {
  if (w.hidden) return undefined;
  const pic = cardImage(w);
  return { title: w.title, category: w.category, source: w.source, ...(w.url ? { url: w.url } : {}), ...(pic ? { image: { ...pic, whole: true } } : {}) };
}
