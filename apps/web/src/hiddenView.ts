// What the eye of a hidden activity shows (AU-25). Pure, so it runs under node --test; loaded with the dialog (PF-01).
import type { Trip } from "@trip/schema";
import { hiddenFromIn, similarTitles, textHiddenFrom } from "@trip/schema/src/hidden.ts";
import { activityTime } from "./format.ts";
import { svAdmin } from "./sv-admin.ts";

/** The chosen travelers by name in trip order, or "Ingen". */
export function pickedLabel(t: Trip, ids: string[]) {
  return t.travelers.filter((x) => ids.includes(x.id)).map((x) => x.name).join(", ") || svAdmin.hidden.none;
}

/** The hidden activities of a day, or only `id`: time, title, whom it is hidden from and the hidden activity it resembles (AU-24).
 * For the whole day, a hidden day title comes first, with an empty id and time (AU-27). */
export function hiddenRows(t: Trip, dayId: string, id?: string) {
  const day = t.days.find((d) => d.id === dayId);
  if (!day) return [];
  const who = hiddenFromIn(day), titleWho = id ? [] : textHiddenFrom(day, day.title);
  const like = (text: string, self?: object) => day.activities.filter((h) => h !== self && h.hiddenFrom?.length && similarTitles(h.text, text)).map((h) => h.text).join(", ");
  const title = titleWho.length ? [{ id: "", time: "", text: day.title, names: pickedLabel(t, titleWho), like: like(day.title) }] : [];
  return [...title, ...day.activities.filter((a) => who.has(a.id) && (!id || a.id === id)).map((a) => ({
    id: a.id, time: activityTime(a), text: a.text, names: pickedLabel(t, who.get(a.id)!),
    like: like(a.text, a),
  }))];
}
