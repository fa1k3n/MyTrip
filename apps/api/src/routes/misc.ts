// Notices by push and "Tyck till" notes (NT-03, NT-05, US-26, US-27, US-34).
import { Hono } from "hono";
import { vapidPublicKey } from "../push.ts";
import { type Env, type Feedback } from "./shared.ts";
import type { Ctx } from "./ctx.ts";

export function miscRoutes(app: Hono<Env>, k: Ctx) {
  const { store, opts, clock, scoped, whoOf } = k;
  // NT-03, NT-05: the public key to subscribe with, and each phone's subscription per trip.
  app.get("/api/push/key", async (c) => (opts.vapidKey ? c.json({ key: await vapidPublicKey(opts.vapidKey) }) : c.json({ error: "off" }, 404)));
  app.put("/api/trips/:id/push", async (c) => {
    if (c.get("role") === "read" || c.get("role") === "propose") return c.json({ error: "forbidden" }, 403); // a token is no person
    const b = await c.req.json<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }>().catch(() => ({} as never));
    const ok = typeof b.endpoint === "string" && /^https:\/\//.test(b.endpoint) && typeof b.keys?.p256dh === "string" && typeof b.keys?.auth === "string";
    if (!ok) return c.json({ error: "endpoint and keys needed" }, 400);
    await store.savePushSub({ tripId: c.req.param("id"), who: whoOf(c), endpoint: b.endpoint as string, p256dh: b.keys!.p256dh as string, auth: b.keys!.auth as string });
    return c.body(null, 204);
  });
  app.delete("/api/trips/:id/push", async (c) => {
    const b = await c.req.json<{ endpoint?: unknown }>().catch(() => ({} as never));
    if (typeof b.endpoint !== "string") return c.json({ error: "endpoint needed" }, 400);
    await store.removePushSubs(c.req.param("id"), { endpoint: b.endpoint, who: whoOf(c) });
    return c.body(null, 204);
  });

  // US-26: the beta notice, accepted once per account.
  app.post("/api/consent", async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "accounts only" }, 404);
    if (!u.consentAt) await store.saveUser({ ...u, consentAt: clock().toISOString() });
    return c.body(null, 204);
  });
  // US-27: "Tyck till" during the beta, from an account that accepted the notice; the superuser reads it.
  app.post("/api/feedback", async (c) => {
    const u = c.get("user");
    if (!u?.consentAt) return c.json({ error: "forbidden" }, 403);
    const b = await c.req.json<{ text?: unknown; page?: unknown; tripId?: unknown; version?: unknown }>().catch(() => ({} as { text?: unknown; page?: unknown; tripId?: unknown; version?: unknown }));
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text || text.length > 2000) return c.json({ error: "1 to 2000 characters" }, 400);
    const page = typeof b.page === "string" ? b.page.slice(0, 40) : "";
    await store.saveFeedback({ id: crypto.randomUUID(), at: clock().toISOString(), who: u.id, name: u.name, text, page, ...(typeof b.tripId === "string" ? { tripId: b.tripId.slice(0, 80) } : {}),
      ...(typeof b.version === "string" && /^[\w.+-]{1,20}$/.test(b.version) ? { version: b.version } : {}) }); // US-38
    return c.body(null, 201);
  });
  // US-34: the superuser answers a note; an empty text clears the answer.
  app.put("/api/feedback/:fid/reply", async (c) => {
    if (c.get("role") !== "admin" || scoped(c)) return c.json({ error: "forbidden" }, 403);
    const f = (await store.feedback()).find((x) => x.id === c.req.param("fid"));
    if (!f) return c.json({ error: "not found" }, 404);
    const { text } = await c.req.json<{ text?: unknown }>().catch(() => ({ text: undefined }));
    const reply = typeof text === "string" ? text.trim() : "";
    if (reply.length > 1000) return c.json({ error: "at most 1000 characters" }, 400);
    const { reply: _r, replyAt: _a, ...rest } = f;
    const next: Feedback = reply ? { ...rest, reply, replyAt: clock().toISOString() } : rest;
    await store.saveFeedback(next);
    return c.json(next);
  });
  // US-34: the writer's own notes with their answers, newest first.
  app.get("/api/feedback/mine", async (c) => {
    const u = c.get("user");
    if (!u?.consentAt) return c.json({ error: "forbidden" }, 403);
    const own = (await store.feedback()).filter((x) => x.who === u.id).sort((a, b) => b.at.localeCompare(a.at));
    return c.json(own.map(({ id, at, text, page, reply, replyAt }) => ({ id, at, text, page, ...(reply ? { reply, replyAt } : {}) })));
  });
  app.get("/api/feedback", async (c) => (c.get("role") === "admin" && !scoped(c) ? c.json((await store.feedback()).sort((a, b) => b.at.localeCompare(a.at))) : c.json({ error: "forbidden" }, 403)));
}
