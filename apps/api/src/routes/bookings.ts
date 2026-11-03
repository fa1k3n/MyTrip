// Ticket files, the trip's mail address and mail proposals (BK-09, BK-11, BK-15, BK-26..33, AI-77).
import { Hono, type Context } from "hono";
import { IMAGE_MAX } from "../wishimage.ts";
import { Trip, accessFor, applyOps, checkTrip, describeError, type Op } from "@trip/schema";
import { addWish, MIN_PHOTO, sortMail, type AskKind } from "../mail.ts";
import { COMMONS_FILES, type Env, MAX_FILE, fileIdsOf, inboxSecret, onItsDay, proposalFiles, storeTicket, ticketType, wishFiles } from "./shared.ts";
import type { Ctx } from "./ctx.ts";

export function bookingRoutes(app: Hono<Env>, k: Ctx, askKind: AskKind) {
  const { store, opts, clock, manager, view, whoOf, actorName, apply, load } = k;
  // BK-09: a Planerare or the superuser uploads a ticket file; the booking that uses it is saved as a normal change.
  app.post("/api/trips/:id/files", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > MAX_FILE) return c.json({ error: "too large" }, 413);
    const type = ticketType(c.req.header("content-type") ?? "", bytes);
    if (!type || !bytes.length) return c.json({ error: "PDF, PNG or JPEG only" }, 415);
    return c.json(await storeTicket(store, c.req.param("id"), c.req.query("name") ?? "", type, bytes), 201);
  });
  // BK-11: a file only for those who get its booking with the reference, and for managers while a proposal holds it.
  app.get("/api/trips/:id/files/:fid", async (c) => {
    const id = c.req.param("fid"), t = await load(c.req.param("id"));
    const shown = view(t, c.get("role"), c.get("travelerId"));
    const seen = fileIdsOf(shown.bookings).includes(id) || wishFiles(shown.dreams).includes(id) // DB-10
      || (manager(c) && proposalFiles(await store.proposals(t.id)).includes(id));
    const f = seen ? await store.file(id) : undefined;
    if (!f || (f.tripId !== t.id && f.tripId !== COMMONS_FILES)) return c.json({ error: "not found" }, 404); // a cached file serves every trip that uses it (DB-11)
    return c.body(f.bytes, 200, { "content-type": f.type, "cache-control": "private, max-age=31536000, immutable" }); // a file never changes under its id
  });
  /** BK-26: who may have the trip's address: those who manage it, and a Resenär whose role sees wishes. */
  const mayMail = (c: Context<Env>, t: Trip) => manager(c) || (c.get("role") === "traveler" && accessFor(t, "traveler").parts.dreams !== "hidden");
  const newAddress = () => `inkorg-${inboxSecret()}@${opts.inboxDomain}`.toLowerCase();
  // BK-27: whether mail import is set up, for those who may have the address, so the app shows its mail buttons; nothing is made here.
  app.get("/api/trips/:id/inbox", async (c) => {
    const t = await load(c.req.param("id"));
    if (!mayMail(c, t)) return c.json({ error: "forbidden" }, 403);
    return c.json(opts.inboxDomain ? { enabled: true, ...(t.inbox ? { address: t.inbox } : {}) } : { enabled: false });
  });
  // BK-26: the trip's one address, made the first time someone who may have it asks for it.
  app.post("/api/trips/:id/inbox", async (c) => {
    const t = await load(c.req.param("id"));
    if (!mayMail(c, t)) return c.json({ error: "forbidden" }, 403);
    if (!opts.inboxDomain) return c.json({ error: "mail import is off" }, 404);
    if (t.inbox) return c.json({ address: t.inbox });
    const address = newAddress(), r = await apply(t, [{ op: "set", path: "inbox", value: address }], actorName(c, t), "trip address");
    return "revision" in r ? c.json({ address }) : c.json({ address: (await load(t.id)).inbox ?? null }, "conflict" in r ? 409 : 422);
  });
  // BK-26: a new address replaces the old at once, and any earlier wish address with it.
  app.post("/api/trips/:id/inbox/replace", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    if (!opts.inboxDomain) return c.json({ error: "mail import is off" }, 404);
    const t = await load(c.req.param("id")), address = newAddress();
    const ops: Op[] = [{ op: "set", path: "inbox", value: address }, ...(t.wishInbox ? [{ op: "remove" as const, path: "wishInbox" }] : [])];
    const r = await apply(t, ops, actorName(c, t), "new trip address");
    return "revision" in r ? c.json({ address }) : c.json({ error: "conflict" }, 409);
  });
  // BK-15, BK-28: on the Node server a manager posts a raw message, sorted like mail through the Worker's email handler.
  app.post("/api/trips/:id/mail", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const r = await sortMail(store, await load(c.req.param("id")), new Uint8Array(await c.req.arrayBuffer()), fetch, askKind);
    return "proposalId" in r ? c.json(r, 202) : "wishId" in r ? c.json(r, 201) : c.json(r, r.error === "too many" ? 429 : 422);
  });
  // BK-33: a wish that came by mail becomes the booking proposal of its kept mail; the wish goes, unless it is planned or has verdicts.
  app.post("/api/trips/:id/dreams/:did/booking", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const t = await load(c.req.param("id")), did = c.req.param("did"), i = t.dreams.findIndex((w) => w.id === did);
    const p = (await store.proposals(t.id)).find((x) => x.status === "wish" && x.wishId === did);
    if (!p || i < 0) return c.json({ error: "no mail" }, 404);
    if (t.days.some((d) => d.activities.some((a) => a.dreamId === did)) || t.memories.some((m) => m.dreamId === did)) return c.json({ error: "in use" }, 409);
    const ops: Op[] = [{ op: "remove", path: `dreams/${i}` }], next = { ...Trip.parse(applyOps(t, ops)), revision: t.revision + 1 };
    if (checkTrip(next).length || !(await store.save(next, t.revision))) return c.json({ error: "conflict" }, 409);
    await store.appendLog({ at: clock().toISOString(), tripId: t.id, actor: actorName(c, t), reason: "wish to booking", ops });
    const file = t.dreams[i]!.image?.kind === "own" ? t.dreams[i]!.image!.file : undefined;
    if (file) await store.removeFiles([file]);
    const { wishId: _w, ...rest } = p;
    await store.saveProposal({ ...rest, status: "pending", baseRevision: next.revision });
    return c.json({ proposalId: p.id }, 201);
  });
  // BK-29: a mail proposal becomes the wish DB-23 would have made, with the first attached photo; its other files go.
  app.post("/api/trips/:id/proposals/:pid/wish", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const p = (await store.proposals(c.req.param("id"))).find((x) => x.id === c.req.param("pid") && x.status === "pending" && x.source?.kind === "mail");
    if (!p) return c.json({ error: "not found" }, 404);
    const files = p.booking?.files ?? [], t = await load(p.tripId);
    const photo = files.find((f) => (f.type === "image/png" || f.type === "image/jpeg") && f.size >= MIN_PHOTO && f.size <= IMAGE_MAX);
    const w = p.wish ?? { category: "Aktivitet", source: "Mejl" };
    const title = w.title || (p.source?.kind === "mail" && p.source.subject) || w.url;
    if (!title) return c.json({ error: "no title" }, 422);
    p.status = "approved";
    await store.saveProposal(p);
    const r = await addWish(store, t, { ...w, title }, photo?.id, actorName(c, t));
    if ("error" in r) { p.status = "pending"; await store.saveProposal(p); return r.error === "duplicate" ? c.json({ ...r, problems: ["duplicate"] }, 409) : c.json(r, 422); } // DB-27
    await store.removeFiles(files.map((f) => f.id).filter((id) => id !== photo?.id));
    return c.json(r, 201);
  });

  app.post("/api/trips/:id/proposals/:pid/:action", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const p = (await store.proposals(c.req.param("id"))).find((x) => x.id === c.req.param("pid") && x.status === "pending");
    if (!p) return c.json({ error: "not found" }, 404);
    if (c.req.param("action") === "reject") {
      p.status = "rejected";
      await store.saveProposal(p);
      const used = new Set(fileIdsOf((await load(p.tripId)).bookings));
      await store.removeFiles((p.booking?.files ?? []).map((f) => f.id).filter((id) => !used.has(id))); // BK-17
      return c.json(p);
    }
    if (p.source?.kind === "mail") { // BK-17: approved with the booking as the reviewer edited it
      const b = await c.req.json<{ baseRevision?: number; ops?: Op[] }>().catch(() => ({} as { baseRevision?: number; ops?: Op[] }));
      if (!Array.isArray(b.ops) || typeof b.baseRevision !== "number") return c.json({ error: "the edited booking is needed" }, 400);
      const t = await load(p.tripId);
      if (t.revision !== b.baseRevision) return c.json({ error: "conflict", revision: t.revision }, 409);
      p.status = "approved"; // first, so apply keeps the files the booking now uses and no longer counts the proposal
      await store.saveProposal(p);
      let r: Awaited<ReturnType<typeof apply>>;
      try { r = await apply(t, b.ops, actorName(c, t), `mail: ${p.source.subject}`, { c, who: whoOf(c) }); } catch (e) { r = { problems: describeError(e) }; }
      if (!("revision" in r)) { p.status = "pending"; await store.saveProposal(p); }
      else { // files the reviewer left out of the booking go too
        const used = new Set(fileIdsOf((await load(p.tripId)).bookings));
        await store.removeFiles((p.booking?.files ?? []).map((f) => f.id).filter((id) => !used.has(id)));
      }
      return "conflict" in r ? c.json({ error: "conflict" }, 409) : "problems" in r ? c.json({ ok: false, problems: r.problems }, 422) : c.json({ proposal: p, result: r });
    }
    const t = await load(p.tripId);
    const item = p.source?.kind === "ai" && p.source.item; // AI-70: one added suggestion goes onto the trip as it is now
    if (t.revision !== p.baseRevision && !item) return c.json({ error: "conflict", revision: t.revision }, 409);
    let ops = p.ops;
    if (p.source?.kind === "ai" && p.source.day) {
      const on = onItsDay(t, p);
      if (!on) { p.status = "rejected"; await store.saveProposal(p); return c.json({ error: "day gone", problems: ["day gone"] }, 409); }
      ops = on;
    }
    const r = await apply(t, ops, p.source?.kind === "ai" ? "ai" : "llm", p.reason, { c, who: "admin" });
    if ("conflict" in r) return c.json({ error: "conflict" }, 409);
    if ("revision" in r) { p.status = "approved"; await store.saveProposal(p); }
    return c.json({ proposal: p, result: r });
  });
  /** AI-77: a suggestion's activity goes onto its day wherever that day is now, in the order of start times; undefined when the day is gone. */
}
