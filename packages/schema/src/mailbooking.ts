// Reads a booking from a confirmation mail or a pasted text, without AI (BK-16, BK-18): schema.org data (JSON-LD) when the
// mail has any, otherwise words in the text. What cannot be read is left out, so the reviewer fills it in.

export type BookingReading = {
  kind?: "stay" | "ticket" | "other"; name?: string; from?: string; to?: string;
  checkIn?: string; checkOut?: string; start?: string; reference?: string; status?: "cancelled"; address?: string;
};

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö",
  eacute: "é", Eacute: "É", uuml: "ü", Uuml: "Ü", ndash: "–", mdash: "—", euro: "€",
};
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);

/** The text of an HTML mail, one line per paragraph, row or line break. */
export function htmlText(html: string): string {
  const s = html.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n").replace(/<[^>]*>/g, "");
  return decode(s).split("\n").map((l) => l.replace(/[\s\u00a0]+/g, " ").trim()).filter(Boolean).join("\n");
}

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, jan: 1, februari: 2, february: 2, feb: 2, mars: 3, march: 3, mar: 3, april: 4, apr: 4, maj: 5, may: 5,
  juni: 6, june: 6, jun: 6, juli: 7, july: 7, jul: 7, augusti: 8, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  oktober: 10, october: 10, okt: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : undefined;

/** The dates in a text, in the order they are written; a date without a year gets `year`. */
function dates(text: string, year?: number): string[] {
  const found: [number, string][] = [];
  const add = (at: number, d?: string) => { if (d) found.push([at, d]); };
  for (const m of text.matchAll(/(?<!\d)(\d{4})-(\d\d)-(\d\d)(?!\d)/g)) add(m.index, iso(+m[1]!, +m[2]!, +m[3]!));
  for (const m of text.matchAll(/(?<![\d.\/])(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g)) add(m.index, iso(+m[3]!, +m[2]!, +m[1]!));
  for (const m of text.matchAll(new RegExp(`(?<![\\d.])(\\d{1,2})\\.?\\s+(${MONTH_RE})\\b\\.?(?:\\s+(\\d{4}))?`, "gi"))) {
    const y = m[3] ? +m[3] : year;
    if (y) add(m.index, iso(y, MONTHS[m[2]!.toLowerCase()]!, +m[1]!));
  }
  return [...new Set(found.sort((a, b) => a[0] - b[0]).map((x) => x[1]))];
}

const TIME = String.raw`(?<![\d./])(\d{1,2})[:.](\d\d)(?![\d./])`;
/** The first time of day written within a short distance after one of the words. */
function timeAfter(text: string, words: string): string | undefined {
  const m = new RegExp(`(?:${words})[^\\n]{0,40}?${TIME}`, "i").exec(text);
  return m && +m[1]! < 24 && +m[2]! < 60 ? `${m[1]!.padStart(2, "0")}:${m[2]}` : undefined;
}
const CHECK_IN = "incheckning|checka in|check-in|checkin|check in|ankomst|arrival";
const CHECK_OUT = "utcheckning|checka ut|check-out|checkout|check out|avresa|departure";
const START = String.raw`\bkl\.?|\bklockan|starttid|\bstart|entrétid|insläpp|\btid\b|\btime\b`;

const REF_WORDS = "bokningsnummer|bokningsnr|bokningsreferens|bokningskod|bekräftelsenummer|ordernummer|ordernr|referensnummer|referens"
  + "|booking number|booking reference|booking id|confirmation number|confirmation code|reservation number|order number";
function reference(text: string): string | undefined {
  for (const m of text.matchAll(new RegExp(`(?:${REF_WORDS})[\\s:#.]*([A-Za-z0-9][A-Za-z0-9-]{2,30})`, "gi")))
    if (/\d/.test(m[1]!)) return m[1];
  return undefined;
}

const STAY = /hotell|hotel|incheckning|check-in|checkin|utcheckning|vandrarhem|hostel|stuga|nätter|\bnatt\b|dubbelrum|enkelrum|\blogi\b|boende/gi;
const TICKET = /biljett|ticket|entré|inträde|evenemang/gi;
function kind(text: string): BookingReading["kind"] {
  const stay = text.match(STAY)?.length ?? 0, ticket = text.match(TICKET)?.length ?? 0;
  return stay > ticket ? "stay" : ticket > stay ? "ticket" : undefined;
}

const PREFIX = /^\s*((fwd?|fw|vb|vs|sv|re|tr|aw|wg)\s*:\s*)+/i;
const GENERIC = new RegExp("^(bokningsbekräftelse|orderbekräftelse|bekräftelse på din (bokning|beställning)|bekräftelse|din bokning|din beställning"
  + "|tack för (din bokning|ditt köp|din beställning)|booking confirmation|order confirmation|your booking|your order|kvitto|e-biljett|biljetter?|tickets?)"
  + "\\s*(?:[-–—:|,]\\s*|\\s+(?:hos|till|på|från)\\s+)", "i");
/** The subject without forwarding prefixes and words that only say it is a confirmation. */
function subjectName(subject: string): string | undefined {
  let s = subject.replace(PREFIX, "").trim();
  for (let g = GENERIC.exec(s); g && s.length > g[0].length; g = GENERIC.exec(s)) s = s.slice(g[0].length).trim();
  return s || undefined;
}

type Ld = Record<string, unknown>;
/** Every object with a schema.org type in the mail's JSON-LD, also inside lists and @graph. */
function ldObjects(html: string): Ld[] {
  const out: Ld[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") { const o = v as Ld; if (o["@type"]) out.push(o); if (o["@graph"]) walk(o["@graph"]); }
  };
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(decode(m[1]!))); } catch { /* not JSON: the text is read instead */ }
  }
  return out;
}
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const obj = (v: unknown): Ld => (v && typeof v === "object" && !Array.isArray(v) ? (v as Ld) : {});
const dateOf = (v: unknown) => /^\d{4}-\d\d-\d\d/.exec(str(v) ?? "")?.[0];
const timeOf = (v: unknown) => /T(\d\d:\d\d)/.exec(str(v) ?? "")?.[1];
function address(v: unknown): string | undefined {
  if (typeof v === "string") return str(v);
  const a = obj(v), city = [str(a.postalCode), str(a.addressLocality)].filter(Boolean).join(" ");
  return [str(a.streetAddress), city].filter(Boolean).join(", ") || undefined;
}
const clean = (r: BookingReading) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as BookingReading;

/** The first reservation in the mail's schema.org data. */
function fromLd(html: string): BookingReading {
  const r = ldObjects(html).find((o) => String(o["@type"]).endsWith("Reservation"));
  if (!r) return {};
  const type = String(r["@type"]), what = obj(r.reservationFor);
  const status = /Cancelled/i.test(str(r.reservationStatus) ?? "") ? "cancelled" as const : undefined;
  const base = { name: str(what.name), reference: str(r.reservationNumber), status, address: address(what.address) ?? address(obj(what.location).address) };
  if (type === "LodgingReservation")
    return clean({ kind: "stay", ...base, from: dateOf(r.checkinTime), to: dateOf(r.checkoutTime), checkIn: timeOf(r.checkinTime), checkOut: timeOf(r.checkoutTime) });
  const at = what.startDate ?? r.startTime ?? what.departureTime;
  const from = dateOf(at);
  return clean({ kind: type === "EventReservation" ? "ticket" : "other", ...base, from, to: dateOf(what.endDate) ?? from, start: timeOf(at) });
}

/** A booking read from a mail's subject, text and HTML; dates within the trip's dates are preferred (BK-16). */
export function readBooking(mail: { subject?: string; text?: string; html?: string }, tripDates: string[] = []): BookingReading {
  const text = [mail.text ?? "", mail.html ? htmlText(mail.html) : ""].join("\n");
  const sorted = [...tripDates].sort(), year = sorted[0] ? +sorted[0].slice(0, 4) : undefined;
  const all = dates(text, year), inTrip = all.filter((d) => sorted.length && d >= sorted[0]! && d <= sorted[sorted.length - 1]!);
  const use = inTrip.length ? inTrip : all;
  const k = kind(`${mail.subject ?? ""}\n${text}`), checkIn = timeAfter(text, CHECK_IN);
  const stay = k === "stay" || (!k && !!checkIn);
  const fromText = clean({
    kind: stay ? "stay" : k, name: mail.subject ? subjectName(mail.subject) : undefined, reference: reference(text),
    from: stay ? [...use].sort()[0] : use[0], to: stay ? [...use].sort().pop() : use[0],
    ...(stay ? { checkIn, checkOut: timeAfter(text, CHECK_OUT) } : k === "ticket" ? { start: timeAfter(text, START) } : {}),
  });
  return clean({ ...fromText, ...(mail.html ? fromLd(mail.html) : {}) });
}
