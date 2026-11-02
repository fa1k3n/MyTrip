// Mail to the trip's inbox that repeats what the trip already has (BK-30, DB-27). Pure, so the server and the app share it.
import type { BookingReading } from "./mailbooking.ts";
import { secretsOf, whoFor, type Secret } from "./hidden.ts";

/** Lower case, without accents and punctuation, single spaces. */
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/** A reference without case, spaces and punctuation. */
const ref = (s: string | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Readable = Pick<BookingReading, "name" | "from" | "reference">;
const same = (a: Readable, b: Readable) => (!!ref(a.reference) && ref(a.reference) === ref(b.reference))
  || (!!a.name && !!b.name && !!a.from && a.from === b.from && plain(a.name) === plain(b.name));

export type Twin = { kind: "booking" | "mail"; id: string; name: string };

/** The booking or earlier pending mail that a mailed booking repeats: the same reference, or the same name and first date.
 * A booking to book (matched by BK-22 instead) or cancelled, and a cancellation, which updates a booking, are no twins (BK-30). */
export function bookingTwin(r: BookingReading, bookings: { id: string; name: string; from: string; reference?: string; status: string }[],
  earlier: { id: string; name: string; reading: Readable }[]): Twin | undefined {
  if (r.status === "cancelled") return undefined;
  const b = bookings.find((x) => x.status !== "tobook" && x.status !== "cancelled" && same(r, x));
  if (b) return { kind: "booking", id: b.id, name: b.name };
  const m = earlier.find((x) => same(r, x.reading));
  return m && { kind: "mail", id: m.id, name: m.name };
}

/** A link without a trailing slash or fragment. */
const link = (u: string | undefined) => (u ?? "").replace(/#.*$/, "").replace(/\/+$/, "");

/** The wish of the trip with the same title as a mailed one, ignoring case, accents and punctuation; when the title was taken from
 * the link's page or host (DB-26, `titleFromLink`), also the same link. A wish that resembles a hidden activity does not count,
 * so a rejection never gives it away (DB-27, AU-30). */
export function wishTwin(r: { title?: string; url?: string; titleFromLink?: boolean },
  t: { dreams?: { id: string; title: string; source: string; url?: string }[]; days: Parameters<typeof secretsOf>[0]["days"] }) {
  if (!r.title || !plain(r.title)) return undefined;
  const secrets: Secret[] = secretsOf(t);
  return (t.dreams ?? []).find((d) => plain(d.title) === plain(r.title!) && (!r.titleFromLink || link(d.url) === link(r.url))
    && !whoFor(secrets, [d.title, d.source]).length);
}
