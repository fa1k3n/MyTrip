// What the place window shows (PL-03..PL-10). Pure, so it runs under node --test.
import type { Op, Trip } from "@trip/schema";
import { sv } from "./sv.ts";
import { keepAi, once } from "./aiReview.ts";

type Place = Trip["places"][number];

export function placeView(p: Place) {
  const q = encodeURIComponent(`${p.name}, ${p.address}`);
  return {
    name: p.name, address: p.address, notes: p.notes,
    phone: p.phone ? { text: p.phone, href: `tel:${p.phone.replace(/\s/g, "")}` } : undefined, // PL-04, PL-05
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}`, // PL-08
    embedUrl: `https://maps.google.com/maps?q=${q}&output=embed`, // PL-07
    website: p.website, // PL-09
    booking: p.bookingUrl ? { url: p.bookingUrl, label: p.bookingLabel ?? sv.bookTicket } : undefined, // PL-10
    unchecked: !!p.ai, // DQ-01, DQ-02: from the AI, to check on the map or its own site
  };
}

/** A Planerare has checked a place from the AI: it is no longer marked, and the AI activities that use it and their wishes are kept
 * with it, one step for what belongs together (DQ-01, AI-83). */
export function confirmPlaceOps(t: Trip, id: string): Op[] {
  const i = t.places.findIndex((p) => p.id === id);
  if (i < 0 || !t.places[i]!.ai) return [];
  const acts = t.days.flatMap((d) => d.activities.filter((a) => a.ai && a.placeIds.includes(id)).map((a) => ({ kind: "activity" as const, dayId: d.id, id: a.id })));
  return once([{ op: "remove", path: `places/${i}/ai` }, ...acts.flatMap((a) => keepAi(t, a))]);
}
