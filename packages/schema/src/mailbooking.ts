// Reads a booking from a confirmation mail or a pasted text, without AI (BK-16, BK-18): schema.org data (JSON-LD) when the
// mail has any, otherwise words in the text. What cannot be read is left out, so the reviewer fills it in.

export type BookingReading = {
  kind?: "stay" | "ticket" | "transport" | "other"; name?: string; from?: string; to?: string;
  origin?: string; destination?: string; arrival?: string; // a Resa; its departure is `start` (BK-38)
  checkIn?: string; checkOut?: string; start?: string; reference?: string; status?: "cancelled"; address?: string;
  price?: { value: number; currency: string }; // BK-24
  phone?: string; website?: string; // the place's, for its place (BK-35, BK-36)
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

const CODES = "SEK|EUR|NOK|DKK|USD|GBP", SIGNS: Record<string, string> = { kr: "SEK", "€": "EUR", $: "USD", "£": "GBP" };
const CUR = String.raw`(${CODES}|kr\.?|€|\$|£)`, AMOUNT = String.raw`(\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const TOTAL_WORDS = "totalbelopp|totalt|summa|att betala|total price|amount paid|total", PRICE_WORDS = "pris|price";
const currency = (c: string) => SIGNS[c.replace(".", "").toLowerCase()] ?? c.toUpperCase();
/** "1 250,00", "1.250,00", "1,250.00" and "1250" as a number: the last separator followed by one or two digits is the decimal one. */
function amount(s: string): number {
  const m = /^(.*?)(?:[.,](\d{1,2}))?$/.exec(s)!;
  return Number(m[1]!.replace(/[ .,]/g, "") + (m[2] ? `.${m[2]}` : ""));
}
/** The price after the first word of `words` that has an amount with a currency before or after it, within the same line. */
function priceAfter(text: string, words: string): BookingReading["price"] {
  const re = new RegExp(String.raw`(?:${words})\b[^\n\d€$£]{0,20}?(?:${CUR}\s*${AMOUNT}|${AMOUNT}\s*${CUR})(?![\d\p{L}])`, "giu");
  for (const m of text.matchAll(re)) {
    const value = amount(m[2] ?? m[3]!);
    if (value > 0) return { value, currency: currency(m[1] ?? m[4]!) };
  }
  return undefined;
}
const price = (text: string) => priceAfter(text, TOTAL_WORDS) ?? priceAfter(text, PRICE_WORDS);

const TRANSPORT = /\b(?:färjan?|ferry|fähre|tåget|tåg|train|zug|flyg|flight|flug|buss|bus|avgång|departure|abfahrt|ankunft)\b/gi;
const DEPART = String.raw`avgång|avgår|departure|departs|abfahrt|départ`, ARRIVE = String.raw`ankomst|framme|arrival|arrives|ankunft|arrivée`;
const STAY = /hotell|hotel|incheckning|check-in|checkin|utcheckning|vandrarhem|hostel|stuga|nätter|\bnatt\b|dubbelrum|enkelrum|\blogi\b|boende/gi;
const TICKET = /biljett|ticket|entré|inträde|evenemang/gi;
function kind(text: string): BookingReading["kind"] {
  const stay = text.match(STAY)?.length ?? 0, ticket = text.match(TICKET)?.length ?? 0, transport = text.match(TRANSPORT)?.length ?? 0;
  return transport > stay && transport > ticket ? "transport" : stay > ticket ? "stay" : ticket > stay ? "ticket" : undefined;
}

/** Forwarding and reply prefixes such as Fwd:, VB: and Re: at the start of a subject. */
export const FORWARD_PREFIX = /^\s*((fwd?|fw|vb|vs|sv|re|tr|aw|wg)\s*:\s*)+/i;
/** "Bokning:" or "Önskan:" first in a subject, after forwarding prefixes: the sender's own sorting (BK-28). */
export const KIND_PREFIX = /^\s*(bokning|önskan)\s*:\s*/i;
/** A forwarded subject in brackets, as "[Fwd: …]": the subject inside them. */
const BRACKETED = /^\s*\[\s*(?:fwd?|fw|vb|vs|tr|wg)\s*:\s*([\s\S]*?)\s*\]\s*$/i;
const unbracket = (s: string): string => { const x = s.replace(FORWARD_PREFIX, ""), m = BRACKETED.exec(x); return m ? unbracket(m[1]!) : x; };
/** A subject without forwarding prefixes, also in brackets, and the sorting prefix. */
export const bareSubject = (s: string) => unbracket(s).replace(FORWARD_PREFIX, "").replace(KIND_PREFIX, "").trim();
const GENERIC_WORDS = "bokningsbekräftelse|orderbekräftelse|bekräftelse på din (bokning|beställning)|bekräftelse|din bokning|din beställning"
  + "|tack för (din bokning|ditt köp|din beställning)|booking confirmation|order confirmation|your booking|your order|kvitto|e-biljett|biljetter?|tickets?"
  + "|(ihre )?(buchungs|reservierungs|bestell)?bestätigung|ihre (buchung|reservierung|bestellung)|confirmation de (réservation|commande)|votre réservation"
  + "|(bestillings|booking)?bekreftelse|(bestillings|booking)?bekræftelse|confirmación de reserva|conferma (di )?prenotazione|(reserverings|boekings)?bevestiging";
const GENERIC = new RegExp(`^(${GENERIC_WORDS})\\s*(?:[-–—:|,]\\s*|\\s+(?:hos|till|på|från)\\s+)`, "i");
/** What is left of a subject that only says it is a confirmation: punctuation and at most a number such as #A55120. */
const NO_NAME = /^[\s#:.,!|–—-]*(?:[\p{L}\d-]*\d[\p{L}\d-]*)?[\s.!]*$/u;
/** A subject in parts, as "Rezervace potvrzena – Penzion Příklad": the one part the text also names, in any language (BK-16). */
function namedPart(subject: string, text: string): string {
  const parts = subject.split(/\s+[-–—|]\s+/), low = text.toLowerCase();
  const named = parts.filter((p) => p.trim().length >= 3 && low.includes(p.trim().toLowerCase()));
  return parts.length > 1 && named.length === 1 ? named[0]!.trim() : subject;
}
/** The subject without forwarding prefixes and words that only say it is a confirmation; none when nothing else is left (BK-16). */
function subjectName(subject: string, text: string): string | undefined {
  let s = bareSubject(subject);
  for (let g = GENERIC.exec(s); g && s.length > g[0].length; g = GENERIC.exec(s)) s = s.slice(g[0].length).trim();
  return NO_NAME.test(s.replace(new RegExp(`^(${GENERIC_WORDS})`, "i"), "")) ? undefined : namedPart(s, text);
}
/** A name after "bokning hos", "köp på", "reservation at" and the like in the text, starting with a capital letter (BK-16). */
const TEXT_NAME = /\b(?:bokning|vistelse|reservation|beställning|köp|booking|stay|order|purchase)\s+(?:hos|på|at|with)\s+(\p{Lu}[^\n.!,;:()]{1,58})/u;
const textName = (text: string) => TEXT_NAME.exec(text)?.[1]?.trim();

/** A telephone number after a telephone word on a line that is not about the guest's own number (BK-35). */
const PHONE = /\b(?:tel(?:efon(?:nummer)?)?|telephone|phone|téléphone|tél|fon|teléfono|telefono)\b\.?[^\n\d+]{0,12}?(\+?\(?\d[\d \t()\/.-]{5,20}\d)/i;
const GUEST = /\b(?:ihre?|your|din|ditt|er|guest|gast|kund|customer|votre|su)\b/i;
function phone(text: string): string | undefined {
  for (const line of text.split("\n")) { const m = PHONE.exec(line); if (m && !GUEST.test(line)) return m[1]!.trim(); }
  return undefined;
}
/** "hotel.example/de" as "https://hotel.example/de"; none when it is not a web address. */
function site(s: string): string | undefined {
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.includes(".") ? u.href.replace(/\/$/, s.endsWith("/") ? "/" : "") : undefined;
  } catch { return undefined; }
}
const DOMAIN = String.raw`(?<![@\w.-])((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\w@-])(?:\/[^\s<>"]*)?)`;
const WEB_WORDS = "webbplats|hemsida|webseite|website|homepage|internet|site web|sitio web|web";
/** The place's web page: after a web word, a www address, or a link to the sender's own domain (BK-35). */
function website(text: string, html: string, from?: string): string | undefined {
  const after = new RegExp(`\\b(?:${WEB_WORDS})\\b[^\\n]{0,12}?${DOMAIN}`, "i").exec(text)?.[1] ?? /(?<![@\w.-])(www\.(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"!,;)]*)?)/i.exec(text)?.[1];
  if (after) return site(after.replace(/[.,;:!)]+$/, ""));
  const domain = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from ?? "")?.[1]?.toLowerCase();
  if (!domain) return undefined;
  for (const m of `${html}\n${text}`.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    try { const u = new URL(m[0]), host = u.hostname.toLowerCase().replace(/^www\./, ""); if (host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`)) return `${u.protocol}//${u.host}/`; } catch { /* not a link */ }
  }
  return undefined;
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

/** totalPrice as a number, a text or a PriceSpecification, with its currency (BK-24). */
function ldPrice(r: Ld): BookingReading["price"] {
  const spec = obj(r.totalPrice), v = r.totalPrice !== undefined && typeof r.totalPrice !== "object" ? r.totalPrice : spec.price;
  const value = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN, cur = str(r.priceCurrency) ?? str(spec.priceCurrency);
  return value > 0 && cur && /^[A-Z]{3}$/.test(cur) ? { value, currency: cur } : undefined;
}

/** The first reservation in the mail's schema.org data. */
function fromLd(html: string): BookingReading {
  const r = ldObjects(html).find((o) => String(o["@type"]).endsWith("Reservation"));
  if (!r) return {};
  const type = String(r["@type"]), what = obj(r.reservationFor);
  const status = /Cancelled/i.test(str(r.reservationStatus) ?? "") ? "cancelled" as const : undefined;
  const url = str(what.url) ?? str(obj(what.location).url);
  const base = { name: str(what.name), reference: str(r.reservationNumber), status, price: ldPrice(r), address: address(what.address) ?? address(obj(what.location).address),
    phone: str(what.telephone) ?? str(obj(what.location).telephone), website: url && /^https?:\/\//i.test(url) ? site(url) : undefined }; // BK-35
  if (type === "LodgingReservation")
    return clean({ kind: "stay", ...base, from: dateOf(r.checkinTime), to: dateOf(r.checkoutTime), checkIn: timeOf(r.checkinTime), checkOut: timeOf(r.checkoutTime) });
  const place = (...vs: unknown[]) => vs.map((v) => str(obj(v).name) ?? str(obj(v).iataCode) ?? str(v)).find(Boolean);
  if (/^(Train|Bus|Flight|Boat)Reservation$/.test(type)) { // BK-38: a Resa, from and to with its departure and arrival
    const origin = place(what.departureStation, what.departureBusStop, what.departureAirport, what.departureBoatTerminal);
    const destination = place(what.arrivalStation, what.arrivalBusStop, what.arrivalAirport, what.arrivalBoatTerminal);
    const from = dateOf(what.departureTime);
    return clean({ kind: "transport", ...base, name: base.name ?? (origin && destination ? `${origin} → ${destination}` : undefined), origin, destination,
      from, to: dateOf(what.arrivalTime) ?? from, start: timeOf(what.departureTime), arrival: timeOf(what.arrivalTime) });
  }
  const at = what.startDate ?? r.startTime ?? what.departureTime;
  const from = dateOf(at);
  return clean({ kind: type === "EventReservation" ? "ticket" : "other", ...base, from, to: dateOf(what.endDate) ?? from, start: timeOf(at) });
}

/** The header lines of a forwarded or quoted mail that give when it was sent: their dates are no booking dates (BK-16). */
const SENT_LINE = /^[ \t>]*(?:date|datum|sent|skickat|gesendet|envoyé|fecha|data|verzonden|sendt|dato|päivämäärä)[ \t]*:.*$/gim;
const DAY = 864e5, NEAR = 30 * DAY;
/** A booking read from a mail's subject, text and HTML; dates within the trip's dates are preferred, and dates more than 30 days
 * from them are left out (BK-16). */
export function readBooking(mail: { subject?: string; text?: string; html?: string; from?: string }, tripDates: string[] = []): BookingReading {
  const text = [mail.text ?? "", mail.html ? htmlText(mail.html) : ""].join("\n");
  const sorted = [...tripDates].sort(), year = sorted[0] ? +sorted[0].slice(0, 4) : undefined;
  const first = sorted[0], last = sorted[sorted.length - 1];
  const all = dates(text.replace(SENT_LINE, ""), year).filter((d) => !first || (Date.parse(d) >= Date.parse(first) - NEAR && Date.parse(d) <= Date.parse(last!) + NEAR));
  const inTrip = all.filter((d) => first && d >= first && d <= last!);
  const use = inTrip.length ? inTrip : all;
  const k = kind(`${mail.subject ?? ""}\n${text}`), checkIn = timeAfter(text, CHECK_IN);
  const stay = k === "stay" || (!k && !!checkIn);
  const fromText = clean({
    kind: stay ? "stay" : k, name: (mail.subject ? subjectName(mail.subject, text) : undefined) ?? textName(text), reference: reference(text), price: price(text),
    phone: phone(text), website: website(text, mail.html ?? "", mail.from), // BK-35
    from: stay ? [...use].sort()[0] : use[0], to: stay ? [...use].sort().pop() : use[0],
    ...(stay ? { checkIn, checkOut: timeAfter(text, CHECK_OUT) } : k === "ticket" ? { start: timeAfter(text, START) }
      : k === "transport" ? { start: timeAfter(text, DEPART), arrival: timeAfter(text, ARRIVE) } : {}), // BK-38
  });
  return clean({ ...fromText, ...(mail.html ? fromLd(mail.html) : {}) });
}

const CONFIRM = /bokningsbekräftelse|orderbekräftelse|bekräftelse|e-biljett|kvitto|booking confirmation|order confirmation|reservation/i;
/** BK-31: a line with a label of any language, a colon and a code with capital letters and digits, such as "예약번호: K7Q2-881". */
const CODE_LINE = /^[^\n:：]{1,40}[:：][ \t]*(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9][A-Z0-9-]{4,19}[ \t]*$/m;
const MONEY = String.raw`[€$£¥₩₹₺฿₫₱]|\b(?:SEK|EUR|NOK|DKK|ISK|USD|GBP|CHF|JPY|KRW|CNY|THB|PLN|CZK|HUF|TRY|AUD|CAD|NZD|INR|IDR|VND|PHP|MYR|SGD|HKD|TWD|MXN|BRL|ZAR|AED|kr|zł|Kč|Ft)\b|원|円|元`;
/** BK-31: a price with a currency, the sign or code before or after the figures. */
const PRICE = new RegExp(`(?:${MONEY})\\s?\\d[\\d\\s.,']*\\d|\\d[\\d\\s.,']*\\d\\s?(?:${MONEY})`, "u");
/** BK-31: a date in figures, as most languages write one. */
const FIGURE_DATE = /\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b|\b\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})\b|\d{4}\s*[年년]\s*\d{1,2}\s*[月월]/u;
const signals = (mail: { subject?: string; text?: string; html?: string }, pdf: boolean) => {
  const text = [mail.text ?? "", mail.html ? htmlText(mail.html) : ""].join("\n");
  const ld = mail.html ? ldObjects(mail.html).some((o) => String(o["@type"]).endsWith("Reservation")) : false;
  return ld || !!reference(text) || CONFIRM.test(mail.subject ?? "") || pdf || CODE_LINE.test(text) || (PRICE.test(text) && FIGURE_DATE.test(text));
};
/** Whether a mail to the trip's one address is a booking or a wish, without AI (BK-28): the sender's prefix decides, else
 * schema.org reservation data, a reference, a confirmation word in the subject, a PDF attachment or a signal in any language (BK-31). */
export function mailKind(mail: { subject?: string; text?: string; html?: string }, pdf = false): "booking" | "wish" {
  const kind = KIND_PREFIX.exec((mail.subject ?? "").replace(FORWARD_PREFIX, ""))?.[1]?.toLowerCase();
  if (kind) return kind === "bokning" ? "booking" : "wish";
  return signals(mail, pdf) ? "booking" : "wish";
}
/** Whether the rules decide by themselves: a prefix or a booking signal; otherwise the AI service may (BK-32). */
export const mailSure = (mail: { subject?: string; text?: string; html?: string }, pdf = false) =>
  KIND_PREFIX.test((mail.subject ?? "").replace(FORWARD_PREFIX, "")) || signals(mail, pdf);
