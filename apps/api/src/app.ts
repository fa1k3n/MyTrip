import { Hono } from "hono";
import { Trip, applyOps, checkTrip, describeError, type Op } from "@trip/schema";

export interface Store {
  list(): Promise<Trip[]>;
  load(id: string): Promise<Trip | undefined>;
  save(next: Trip): Promise<void>;
  remove(id: string): Promise<boolean>;
  image(name: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
}
export type Tokens = { read: string; propose: string; admin: string };
type Role = "read" | "propose" | "admin";
type Proposal = { id: string; tripId: string; baseRevision: number; ops: Op[]; reason: string; status: "pending" | "approved" | "rejected"; at: string };
const rank: Record<Role, number> = { read: 1, propose: 2, admin: 3 };
const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** In-memory store for tests and demos. */
export function memoryStore(trips: unknown[] = [], images: Record<string, Uint8Array<ArrayBuffer>> = {}): Store {
  const m = new Map(trips.map((t) => { const p = Trip.parse(t); return [p.id, p] as const; }));
  return {
    list: async () => [...m.values()].map((t) => structuredClone(t)),
    load: async (id) => (m.has(id) ? structuredClone(m.get(id)) : undefined),
    save: async (t) => void m.set(t.id, structuredClone(t)),
    remove: async (id) => m.delete(id),
    image: async (name) => images[name],
  };
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trip";

export function createApp(store: Store, tokens: Tokens) {
  const app = new Hono<{ Variables: { role: Role } }>();
  const proposals: Proposal[] = []; // TODO persist (D1)
  const log: object[] = [];         // TODO persist (D1), MC-08

  app.use("/api/*", async (c, next) => {
    const t = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
    const role = (Object.keys(tokens) as Role[]).find((r) => tokens[r] && tokens[r] === t);
    if (!role) return c.json({ error: "unauthorized" }, 401);
    c.set("role", role);
    await next();
  });
  const need = (c: { get(k: "role"): Role }, min: Role) => rank[c.get("role")] >= rank[min];
  const view = (t: Trip, role: Role) => (role === "read" ? { ...t, bookings: t.bookings.map(({ reference, ...b }) => b) } : t); // MC-11

  async function apply(base: Trip, ops: Op[], actor: string, reason: string) {
    const next = Trip.parse(applyOps(base, ops));
    const problems = checkTrip(next);
    if (problems.length) return { problems };
    await store.save({ ...next, id: base.id, revision: base.revision + 1 });
    log.push({ at: new Date().toISOString(), tripId: base.id, actor, reason, ops });
    return { revision: base.revision + 1 };
  }

  app.get("/api/trips", async (c) => c.json((await store.list()).map((t) => view(t, c.get("role")))));
  app.post("/api/trips", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403);
    const b = await c.req.json<{ title?: string; purpose?: string }>().catch(() => ({ title: undefined, purpose: undefined }));
    const title = b.title?.trim();
    if (!title) return c.json({ error: "title required" }, 400);
    const trip = Trip.parse({
      id: `${slug(title)}-${crypto.randomUUID().slice(0, 6)}`, revision: 1, title, purpose: b.purpose ?? "", timezone: "Europe/Stockholm",
      stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [],
    });
    await store.save(trip);
    log.push({ at: new Date().toISOString(), tripId: trip.id, actor: "user", reason: "create", ops: [] });
    return c.json(trip, 201);
  });
  app.get("/api/log", (c) => (need(c, "admin") ? c.json(log) : c.json({ error: "forbidden" }, 403)));

  // Every route below works on one trip, which must exist.
  app.use("/api/trips/:id/*", async (c, next) => ((await store.load(c.req.param("id"))) ? next() : c.json({ error: "not found" }, 404)));
  const load = async (id: string) => (await store.load(id))!;

  app.get("/api/trips/:id", async (c) => {
    const t = await store.load(c.req.param("id"));
    return t ? c.json(view(t, c.get("role"))) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/trips/:id", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403); // MC-07
    if (!(await store.remove(c.req.param("id")))) return c.json({ error: "not found" }, 404);
    log.push({ at: new Date().toISOString(), tripId: c.req.param("id"), actor: "user", reason: "delete", ops: [] });
    return c.body(null, 204);
  });
  app.get("/api/trips/:id/image", async (c) => {
    const name = (await load(c.req.param("id"))).image;
    const bytes = name ? await store.image(name) : undefined;
    if (!name || !bytes) return c.json({ error: "not found" }, 404);
    return c.body(bytes, 200, { "content-type": mime[name.split(".").pop()!], "cache-control": "private, max-age=3600" });
  });
  app.get("/api/trips/:id/check", async (c) => c.json({ problems: checkTrip(await load(c.req.param("id"))) }));
  app.get("/api/trips/:id/proposals", (c) => c.json(proposals.filter((p) => p.tripId === c.req.param("id"))));

  app.post("/api/trips/:id/changes", async (c) => {
    if (!need(c, "propose")) return c.json({ error: "forbidden" }, 403); // MC-10
    const b = await c.req.json<{ baseRevision: number; ops: Op[]; reason?: string; dryRun?: boolean }>();
    const t = await load(c.req.param("id"));
    if (b.baseRevision !== t.revision) return c.json({ error: "conflict", revision: t.revision }, 409); // MC-05
    let problems: string[];
    try {
      problems = checkTrip(Trip.parse(applyOps(t, b.ops)));
    } catch (e) {
      return c.json({ ok: false, problems: describeError(e) }, 422); // MC-03
    }
    const summary = b.ops.map((o) => `${o.op} ${o.path}`);
    if (b.dryRun) return c.json({ ok: problems.length === 0, problems, summary }); // MC-04
    if (problems.length) return c.json({ ok: false, problems }, 422);
    if (c.get("role") !== "admin") {
      const p: Proposal = { id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: b.ops, reason: b.reason ?? "", status: "pending", at: new Date().toISOString() };
      proposals.push(p); // MC-06, MC-07: only an admin applies or approves
      return c.json({ proposalId: p.id, status: p.status }, 202);
    }
    return c.json(await apply(t, b.ops, "user", b.reason ?? ""));
  });

  app.post("/api/trips/:id/proposals/:pid/:action", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403);
    const p = proposals.find((x) => x.id === c.req.param("pid") && x.tripId === c.req.param("id") && x.status === "pending");
    if (!p) return c.json({ error: "not found" }, 404);
    if (c.req.param("action") === "reject") { p.status = "rejected"; return c.json(p); }
    const t = await load(p.tripId);
    if (t.revision !== p.baseRevision) return c.json({ error: "conflict", revision: t.revision }, 409);
    const r = await apply(t, p.ops, "llm", p.reason);
    if ("revision" in r) p.status = "approved";
    return c.json({ proposal: p, result: r });
  });
  return app;
}
