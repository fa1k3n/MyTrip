// Mail to a trip's inbox becomes a proposed booking (BK-15, BK-16): read without AI, with its ticket attachments, and stored
// as a proposal that a Planerare or the superuser reviews (BK-17). Nothing in the trip changes here.
// Mail to a trip's wish address becomes a wish at once (DB-23..DB-25).
import PostalMime from "postal-mime";
import { applyOps, checkTrip, readBooking, readWish, Trip } from "@trip/schema";
import { MAX_FILE, newFileId, storeTicket, ticketType, type Proposal, type Store } from "./app.ts";
import { IMAGE_MAX, imageType } from "./wishimage.ts";
import { sv } from "../../web/src/sv.ts";

const MAX_PENDING = 20, MAX_FILES = 5;
const MAX_WISHES = 20, DAY_MS = 86_400_000, MIN_PHOTO = 8 * 1024; // DB-24: smaller images are taken to be logos
type Result = { proposalId: string } | { error: "unknown address" | "too many" };
export type WishResult = { wishId: string } | { error: "unknown address" | "too many" | "no title" | "invalid" };

/** A mail for the trip with this inbox or wish address; an unknown address is rejected (BK-14, BK-15, DB-21). */
export async function receiveMail(store: Store, raw: Uint8Array | ArrayBuffer, to: string): Promise<Result | WishResult> {
  const address = (/<([^>]+)>/.exec(to)?.[1] ?? to).trim().toLowerCase();
  const trips = address ? await store.list() : [];
  const t = trips.find((x) => x.inbox?.toLowerCase() === address);
  if (t) return importMail(store, t, raw);
  const w = trips.find((x) => x.wishInbox?.toLowerCase() === address);
  return w ? importWish(store, w, raw) : { error: "unknown address" };
}

/** Reads the mail into a pending proposal for the trip, with at most five PDF, PNG or JPEG attachments of at most 2 MB. */
export async function importMail(store: Store, t: Trip, raw: Uint8Array | ArrayBuffer): Promise<Result> {
  const pending = (await store.proposals(t.id)).filter((p) => p.status === "pending" && p.source?.kind === "mail");
  if (pending.length >= MAX_PENDING) return { error: "too many" };
  const m = await PostalMime.parse(raw);
  const files = [];
  for (const a of m.attachments) {
    const bytes = typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content);
    const type = ticketType(a.mimeType, bytes);
    if (!type || bytes.length > MAX_FILE || files.length >= MAX_FILES) continue;
    files.push(await storeTicket(store, t.id, a.filename ?? "", type, bytes));
  }
  const from = m.from && "address" in m.from && m.from.address ? (m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address) : "";
  const subject = m.subject ?? "", at = new Date().toISOString();
  const booking = readBooking({ subject, text: m.text, html: m.html }, t.days.map((d) => d.date));
  const p: Proposal = {
    id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: [], reason: `mail: ${subject}`, status: "pending", at,
    source: { kind: "mail", from, subject, at }, booking: { ...booking, ...(files.length ? { files } : {}) },
  };
  await store.saveProposal(p);
  return { proposalId: p.id };
}

/** "Mejl", or "Mejl från" and the first word of the sender's display name; only a hint, since a sender can be forged (DB-23). */
export const wishSource = (name: string | undefined) => sv.wish.fromMail(name?.replace(/["']/g, "").trim().split(/\s+/)[0]?.slice(0, 40) || undefined);

/** Adds the wish the mail describes, with the largest attached photo of 8 KB to the DB-08 size as its own photo (DB-23, DB-24). */
export async function importWish(store: Store, t: Trip, raw: Uint8Array | ArrayBuffer): Promise<WishResult> {
  const now = Date.now();
  if (t.dreams.filter((w) => w.mailedAt && now - Date.parse(w.mailedAt) < DAY_MS).length >= MAX_WISHES) return { error: "too many" }; // DB-25
  const m = await PostalMime.parse(raw);
  const r = readWish({ subject: m.subject, text: m.text, html: m.html });
  if (!r.title) return { error: "no title" };
  const photo = m.attachments
    .map((a) => (typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content)))
    .map((bytes) => ({ bytes, type: imageType(bytes) }))
    .filter((x) => x.type && x.bytes.length >= MIN_PHOTO && x.bytes.length <= IMAGE_MAX)
    .sort((a, b) => b.bytes.length - a.bytes.length)[0];
  const file = photo && newFileId();
  if (photo && file) await store.saveFile({ id: file, tripId: t.id, type: photo.type! }, photo.bytes);
  const id = `dream-${crypto.randomUUID().slice(0, 8)}`;
  const wish = {
    id, title: r.title, category: r.category, source: wishSource(m.from && "name" in m.from ? m.from.name : undefined), icon: "✨", votes: 0,
    ...(r.url ? { url: r.url } : {}), ...(file ? { image: { file, kind: "own" as const } } : {}), mailedAt: new Date(now).toISOString(),
  };
  // Like every change: applyOps, the schema, checkTrip; a change that came first is read again (DP-03).
  for (let base = t, tries = 0; tries < 3; tries++) {
    const ops = [{ op: "add" as const, path: "dreams/-", value: wish }];
    let next: Trip;
    try { next = Trip.parse(applyOps(base, ops)); } catch { break; }
    if (checkTrip(next).length) break;
    if (await store.save({ ...next, id: base.id, revision: base.revision + 1 }, base.revision)) {
      await store.appendLog({ at: wish.mailedAt, tripId: base.id, actor: "mejl", reason: `wish by mail: ${r.title}`, ops });
      return { wishId: id };
    }
    const again = await store.load(t.id);
    if (!again) break;
    base = again;
  }
  if (file) await store.removeFiles([file]);
  return { error: "invalid" };
}
