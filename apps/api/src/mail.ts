// Mail to a trip's one address (BK-26) is sorted without AI (BK-28): a booking becomes a proposed booking (BK-15, BK-16), read
// with its ticket attachments and stored as a proposal that a Planerare or the superuser reviews (BK-17), so nothing in the trip
// changes here; anything else becomes a wish at once (DB-23..DB-25).
import PostalMime from "postal-mime";
import { applyOps, checkTrip, mailKind, mailSure, readBooking, readBookings, readWish, Trip, wishTwin, type WishReading } from "@trip/schema";
import { MAX_FILE, newFileId, storeTicket, ticketType, type Proposal, type Store } from "./app.ts";
import { IMAGE_MAX, imageType } from "./wishimage.ts";
import { sv } from "../../web/src/sv.ts";

const MAX_PENDING = 20, MAX_FILES = 5;
const MAX_WISHES = 20, DAY_MS = 86_400_000;
export const MIN_PHOTO = 8 * 1024; // DB-24: smaller images are taken to be logos
type Result = { proposalId: string } | { error: "unknown address" | "too many" };
/** BK-32: asks the AI service whether a mail the rules could not sort is a booking; undefined when AI is off or fails. */
export type AskKind = (t: Trip, mailText: string) => Promise<"booking" | "wish" | undefined>;
export type WishResult = { wishId: string } | { error: "unknown address" | "too many" | "no title" | "invalid" | "duplicate" };

/** A mail for the trip with this address, or with a booking or wish address made before BK-26; an unknown address is rejected
 * (BK-15, BK-26). `f` fetches a linked page for a wish without a title (DB-26). */
export async function receiveMail(store: Store, raw: Uint8Array | ArrayBuffer, to: string, f: typeof fetch = fetch, ask?: AskKind): Promise<Result | WishResult> {
  const address = (/<([^>]+)>/.exec(to)?.[1] ?? to).trim().toLowerCase();
  const t = address ? (await store.list()).find((x) => x.inbox?.toLowerCase() === address || x.wishInbox?.toLowerCase() === address) : undefined;
  return t ? sortMail(store, t, raw, f, ask) : { error: "unknown address" };
}

/** A booking becomes a proposal, anything else a wish (BK-28, BK-31); what the rules cannot sort, the AI service may (BK-32). */
export async function sortMail(store: Store, t: Trip, raw: Uint8Array | ArrayBuffer, f: typeof fetch = fetch, ask?: AskKind): Promise<Result | WishResult> {
  const m = await PostalMime.parse(raw), mail = { subject: m.subject, text: m.text, html: m.html };
  const pdf = m.attachments.some((a) => ticketType(a.mimeType, typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content)) === "application/pdf");
  const kind = mailKind(mail, pdf) === "booking" || (!mailSure(mail, pdf) && ask && await ask(t, mailText(m.subject ?? "", m.text, m.html)) === "booking") ? "booking" : "wish";
  return kind === "booking" ? importMail(store, t, raw) : importWish(store, t, raw, f);
}

/** Reads the mail into a pending proposal for the trip, with at most five PDF, PNG or JPEG attachments of at most 2 MB. */
export async function importMail(store: Store, t: Trip, raw: Uint8Array | ArrayBuffer): Promise<Result> {
  const pending = (await store.proposals(t.id)).filter((p) => p.status === "pending" && p.source?.kind === "mail");
  if (pending.length >= MAX_PENDING) return { error: "too many" };
  const m = await PostalMime.parse(raw);
  const files: Awaited<ReturnType<typeof storeTicket>>[] = [];
  for (const a of m.attachments) {
    const bytes = typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content);
    const type = ticketType(a.mimeType, bytes);
    if (!type || bytes.length > MAX_FILE || files.length >= MAX_FILES) continue;
    files.push(await storeTicket(store, t.id, a.filename ?? "", type, bytes));
  }
  const from = m.from && "address" in m.from && m.from.address ? (m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address) : "";
  const subject = m.subject ?? "", at = new Date().toISOString();
  const bookings = readBookings({ subject, text: m.text, html: m.html, from }, t.days.map((d) => d.date)); // BK-39: one per direction
  const wish = { ...readWish({ subject, text: m.text, html: m.html }), source: wishSource(m.from && "name" in m.from ? m.from.name : undefined) }; // BK-29
  const ps: Proposal[] = bookings.map((booking, i) => ({
    id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: [], reason: `mail: ${subject}`, status: "pending", at,
    source: { kind: "mail", from, subject, at }, booking: { ...booking, ...(files.length && !i ? { files } : {}) }, wish, // the attachments with the first
    mailText: mailText(subject, m.text, m.html), // AI-60
  }));
  for (const p of ps) await store.saveProposal(p);
  return { proposalId: ps[0]!.id };
}

const MAIL_TEXT_MAX = 12_000;
/** The mail as plain text for "Läs med AI", without mejl addresses and telephone numbers (AI-04, AI-60). */
export function mailText(subject: string, text?: string, html?: string) {
  const body = text?.trim() || (html ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  return `${subject}\n\n${body}`.replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, "[mejl]").replace(/(?:\+|00)\d[\d\s-]{6,}\d|\b0\d{1,3}[\s-]?\d{2,3}[\s-]?\d{2}[\s-]?\d{2}\b/g, "[telefon]")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAIL_TEXT_MAX);
}

const PAGE_MAX = 64 * 1024, PAGE_MS = 5000;
const UA = "Baslager/0.1 (https://github.com/fa1k3n/MyTrip; wish titles)";
/** An address on the own machine or network: an IP address or localhost, never fetched (DB-26). */
const local = (host: string) => host === "localhost" || host.endsWith(".localhost") || host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host);
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? all);

/** The title of a linked page, og:title first, from its first 64 KB; the link's host when there is none (DB-26). */
export async function pageTitle(url: string, f: typeof fetch = fetch): Promise<string> {
  const u = new URL(url), host = u.hostname.replace(/^www\./, "");
  if (local(u.hostname)) return host;
  try {
    const res = await f(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(PAGE_MS) });
    if (!res.ok || !res.body) return host;
    const reader = res.body.getReader(), parts: Uint8Array[] = [];
    for (let n = 0; n < PAGE_MAX;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); n += value.length;
    }
    await reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(new Uint8Array(parts.flatMap((p) => [...p])).slice(0, PAGE_MAX));
    const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]
      ?? /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(html)?.[1];
    const title = decode((og ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim()).slice(0, 120);
    return title || host;
  } catch { return host; }
}

/** "Mejl", or "Mejl från" and the first word of the sender's display name; only a hint, since a sender can be forged (DB-23). */
export const wishSource = (name: string | undefined) => sv.wish.fromMail(name?.replace(/["']/g, "").trim().split(/\s+/)[0]?.slice(0, 40) || undefined);

/** Adds the wish the mail describes, with the largest attached photo of 8 KB to the DB-08 size as its own photo (DB-23, DB-24). */
export async function importWish(store: Store, t: Trip, raw: Uint8Array | ArrayBuffer, f: typeof fetch = fetch): Promise<WishResult> {
  const now = Date.now();
  if (t.dreams.filter((w) => w.mailedAt && now - Date.parse(w.mailedAt) < DAY_MS).length >= MAX_WISHES) return { error: "too many" }; // DB-25
  const m = await PostalMime.parse(raw);
  const r = readWish({ subject: m.subject, text: m.text, html: m.html });
  const titleFromLink = !r.title && !!r.url;
  if (!r.title && r.url) r.title = await pageTitle(r.url, f); // DB-26
  if (!r.title) return { error: "no title" };
  if (wishTwin({ ...r, titleFromLink }, t)) return { error: "duplicate" }; // DB-27: already on the trip
  const photo = m.attachments
    .map((a) => (typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content)))
    .map((bytes) => ({ bytes, type: imageType(bytes) }))
    .filter((x) => x.type && x.bytes.length >= MIN_PHOTO && x.bytes.length <= IMAGE_MAX)
    .sort((a, b) => b.bytes.length - a.bytes.length)[0];
  const file = photo && newFileId();
  if (photo && file) await store.saveFile({ id: file, tripId: t.id, type: photo.type! }, photo.bytes);
  const r2 = await addWish(store, t, { ...r, title: r.title, titleFromLink, source: wishSource(m.from && "name" in m.from ? m.from.name : undefined) }, file, "mejl", now);
  if ("error" in r2 && file) await store.removeFiles([file]);
  if ("wishId" in r2) await keepMail(store, t, m, r2.wishId); // BK-33
  return r2;
}

/** BK-33: the mail of a wish, kept on the server as a closed proposal read as a booking, so the wish can become one later. */
async function keepMail(store: Store, t: Trip, m: Awaited<ReturnType<typeof PostalMime.parse>>, wishId: string) {
  const from = m.from && "address" in m.from && m.from.address ? (m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address) : "";
  const subject = m.subject ?? "", at = new Date().toISOString();
  await store.saveProposal({ id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: [], reason: `mail: ${subject}`, status: "wish", wishId, at,
    source: { kind: "mail", from, subject, at }, booking: readBooking({ subject, text: m.text, html: m.html, from }, t.days.map((d) => d.date)), mailText: mailText(subject, m.text, m.html) });
}

/** Adds a wish read from a mail, with an own photo when there is one (DB-23, BK-29); not one the trip already has (DB-27). */
export async function addWish(store: Store, t: Trip, r: WishReading & { title: string; source: string; titleFromLink?: boolean }, file: string | undefined, actor: string, now = Date.now()): Promise<WishResult> {
  if (wishTwin(r, t)) return { error: "duplicate" };
  const id = `dream-${crypto.randomUUID().slice(0, 8)}`;
  const wish = {
    id, title: r.title, category: r.category, source: r.source, icon: "✨", votes: 0,
    ...(r.url ? { url: r.url } : {}), ...(file ? { image: { file, kind: "own" as const } } : {}), mailedAt: new Date(now).toISOString(),
  };
  // Like every change: applyOps, the schema, checkTrip; a change that came first is read again (DP-03).
  for (let base = t, tries = 0; tries < 3; tries++) {
    const ops = [{ op: "add" as const, path: "dreams/-", value: wish }];
    let next: Trip;
    try { next = Trip.parse(applyOps(base, ops)); } catch { break; }
    if (checkTrip(next).length) break;
    if (await store.save({ ...next, id: base.id, revision: base.revision + 1 }, base.revision)) {
      await store.appendLog({ at: wish.mailedAt, tripId: base.id, actor, reason: `wish by mail: ${r.title}`, ops });
      return { wishId: id };
    }
    const again = await store.load(t.id);
    if (!again) break;
    base = again;
  }
  return { error: "invalid" };
}
