// Mail to a trip's inbox becomes a proposed booking (BK-15, BK-16): read without AI, with its ticket attachments, and stored
// as a proposal that a Planerare or the superuser reviews (BK-17). Nothing in the trip changes here.
import PostalMime from "postal-mime";
import { readBooking, type Trip } from "@trip/schema";
import { MAX_FILE, storeTicket, ticketType, type Proposal, type Store } from "./app.ts";

const MAX_PENDING = 20, MAX_FILES = 5;
type Result = { proposalId: string } | { error: "unknown address" | "too many" };

/** A mail for the trip with this inbox address; an unknown address is rejected (BK-14, BK-15). */
export async function receiveMail(store: Store, raw: Uint8Array | ArrayBuffer, to: string): Promise<Result> {
  const address = (/<([^>]+)>/.exec(to)?.[1] ?? to).trim().toLowerCase();
  const t = address && (await store.list()).find((x) => x.inbox?.toLowerCase() === address);
  return t ? importMail(store, t, raw) : { error: "unknown address" };
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
