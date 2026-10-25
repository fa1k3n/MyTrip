// What the place window shows (PL-03..PL-10). Pure, so it runs under node --test.
import type { Trip } from "@trip/schema";
import { sv } from "./sv.ts";

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
  };
}
