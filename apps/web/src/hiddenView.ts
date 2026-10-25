// What the eye of a hidden activity shows (AU-25). Pure, so it runs under node --test; loaded with the dialog (PF-01).
import type { Trip } from "@trip/schema";
import { hiddenFromIn, similarTitles } from "@trip/schema/src/hidden.ts";
import { activityTime } from "./format.ts";
import { svAdmin } from "./sv-admin.ts";

/** The chosen travelers by name in trip order, or "Ingen". */
export function pickedLabel(t: Trip, ids: string[]) {
  return t.travelers.filter((x) => ids.includes(x.id)).map((x) => x.name).join(", ") || svAdmin.hidden.none;
}

/** The hidden activities of a day, or only `id`: time, title, whom it is hidden from and the hidden activity it resembles (AU-24). */
export function hiddenRows(t: Trip, dayId: string, id?: string) {
  const day = t.days.find((d) => d.id === dayId);
  if (!day) return [];
  const who = hiddenFromIn(day);
  return day.activities.filter((a) => who.has(a.id) && (!id || a.id === id)).map((a) => ({
    id: a.id, time: activityTime(a), text: a.text, names: pickedLabel(t, who.get(a.id)!),
    like: day.activities.filter((h) => h !== a && h.hiddenFrom?.length && similarTitles(h.text, a.text)).map((h) => h.text).join(", "),
  }));
}
