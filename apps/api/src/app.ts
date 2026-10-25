import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { Settings, Trip, applyOps, checkTrip, describeError, type Op } from "@trip/schema";
import { checkTraffic, type TrafficOpts } from "./traffic.ts";

export type Proposal = { id: string; tripId: string; baseRevision: number; ops: Op[]; reason: string; status: "pending" | "approved" | "rejected"; at: string };
export type LogEntry = { at: string; tripId: string; actor: string; reason: string; ops: Op[] };

export interface Store {
  list(): Promise<Trip[]>;
  load(id: string): Promise<Trip | undefined>;
  /** With `baseRevision`, saves only if the stored trip still has that revision; false when another change came first (DP-03). */
  save(next: Trip, baseRevision?: number): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  image(name: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  /** Share link secrets by trip id (AU-01). */
  links(): Promise<Record<string, string>>;
  saveLinks(l: Record<string, string>): Promise<void>;
  /** Proposals and the change log are kept, so they survive a restart (DP-04, MC-08). */
  proposals(tripId: string): Promise<Proposal[]>;
  saveProposal(p: Proposal): Promise<void>;
  appendLog(e: LogEntry): Promise<void>;
  log(): Promise<LogEntry[]>;
}
export type Tokens = { read: string; propose: string; admin: string };
/** Admin login (AU-04): off when no password is set. The session key signs the cookie. */
export type Auth = { adminPassword?: string; sessionKey?: string };
type Role = "read" | "propose" | "admin" | "link";
const rank: Record<Role, number> = { link: 1, read: 1, propose: 2, admin: 3 };
const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** In-memory store for tests and demos. */
export function memoryStore(trips: unknown[] = [], images: Record<string, Uint8Array<ArrayBuffer>> = {}): Store {
  const m = new Map(trips.map((t) => { const p = Trip.parse(t); return [p.id, p] as const; }));
  let settings = Settings.parse({});
  let links: Record<string, string> = {};
  const proposals = new Map<string, Proposal>(), log: LogEntry[] = [];
  return {
    links: async () => ({ ...links }),
    saveLinks: async (l) => { links = { ...l }; },
    proposals: async (tripId) => [...proposals.values()].filter((p) => p.tripId === tripId).map((p) => structuredClone(p)),
    saveProposal: async (p) => void proposals.set(p.id, structuredClone(p)),
    appendLog: async (e) => void log.push(structuredClone(e)),
    log: async () => structuredClone(log),
    list: async () => [...m.values()].sort((a, b) => a.id.localeCompare(b.id)).map((t) => structuredClone(t)),
    load: async (id) => (m.has(id) ? structuredClone(m.get(id)) : undefined),
    save: async (t, base) => {
      if (base !== undefined && m.get(t.id)?.revision !== base) return false;
      m.set(t.id, structuredClone(t));
      return true;
    },
    remove: async (id) => m.delete(id),
    image: async (name) => images[name],
    loadSettings: async () => structuredClone(settings),
    saveSettings: async (s) => { settings = structuredClone(s); },
  };
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trip";

/** Compares secrets without stopping at the first difference. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const SESSION_DAYS = 30, MAX_FAILS = 5, FAIL_WINDOW_MS = 15 * 60_000;
/** 144 random bits as base64url (AU-01). */
const newSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, "-").replace(/\//g, "_");
/** The only changes a share link may make: ticking tasks and packing items (AU-03). */
const linkMayChange = (ops: Op[]) => ops.length > 0 && ops.every((o) =>
  o.op === "set" && ((/^tasks\/\d+\/done$/.test(o.path) && typeof o.value === "boolean")
    || (/^(packed|travelers\/\d+\/packed)$/.test(o.path) && Array.isArray(o.value) && o.value.every((v) => typeof v === "string"))));

type Env = { Variables: { role: Role; tripId?: string } };

export function createApp(store: Store, tokens: Tokens, opts: { aiService?: boolean; auth?: Auth } & TrafficOpts = {}) {
  const app = new Hono<Env>();
  const { adminPassword, sessionKey } = opts.auth ?? {};
  const fails = new Map<string, { n: number; since: number }>(); // per address, in memory (AU-05)

  // AU-04, AU-05: admin login with a password, answered with a signed session cookie.
  app.post("/api/login", async (c) => {
    if (!adminPassword || !sessionKey) return c.json({ error: "login is off" }, 404);
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local", now = Date.now();
    const f = fails.get(ip);
    if (f && now - f.since > FAIL_WINDOW_MS) fails.delete(ip);
    if ((fails.get(ip)?.n ?? 0) >= MAX_FAILS) return c.json({ error: "too many attempts" }, 429);
    const b = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
    if (typeof b.password !== "string" || !same(b.password, adminPassword)) {
      const g = fails.get(ip) ?? { n: 0, since: now };
      fails.set(ip, { ...g, n: g.n + 1 });
      return c.json({ error: "wrong password" }, 401);
    }
    fails.delete(ip);
    const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
    await setSignedCookie(c, "session", `admin.${exp}`, sessionKey, { httpOnly: true, secure: true, sameSite: "Strict", path: "/api", maxAge: SESSION_DAYS * 86400 });
    return c.body(null, 204);
  });
  app.post("/api/logout", (c) => { deleteCookie(c, "session", { path: "/api", secure: true }); return c.body(null, 204); });

  // Who is calling: an admin session, an MCP token, or a share link (AU-01, AU-04, AU-09).
  app.use("/api/*", async (c, next) => {
    if (sessionKey) {
      const v = await getSignedCookie(c, sessionKey, "session");
      const exp = v ? Number(v.split(".")[1]) : 0;
      if (v && v.startsWith("admin.") && exp * 1000 > Date.now()) { c.set("role", "admin"); return next(); }
    }
    const t = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
    const role = (Object.keys(tokens) as (keyof Tokens)[]).find((r) => tokens[r] && same(tokens[r], t));
    if (role) { c.set("role", role); return next(); }
    const m = /^link\.([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(t);
    const secret = m ? (await store.links())[m[1]] : undefined;
    if (m && secret && same(secret, m[2])) { c.set("role", "link"); c.set("tripId", m[1]); return next(); }
    return c.json({ error: "unauthorized" }, 401);
  });
  const need = (c: { get(k: "role"): Role }, min: Role) => rank[c.get("role")] >= rank[min];
  const isLink = (c: Context<Env>) => c.get("role") === "link";
  const view = (t: Trip, role: Role) => (role === "read" || role === "link" ? { ...t, bookings: t.bookings.map(({ reference, ...b }) => b) } : t); // MC-11

  app.get("/api/me", (c) => c.json(isLink(c) ? { role: "link", tripId: c.get("tripId") } : { role: c.get("role") }));
  // A link sees one trip only; other trips do not exist for it (AU-03).
  app.use("/api/trips/:id/*", async (c, next) => (isLink(c) && c.req.param("id") !== c.get("tripId") ? c.json({ error: "not found" }, 404) : next()));
  app.use("/api/trips/:id", async (c, next) => (isLink(c) && c.req.param("id") !== c.get("tripId") ? c.json({ error: "not found" }, 404) : next()));
  app.use("/api/settings", async (c, next) => (isLink(c) ? c.json({ error: "forbidden" }, 403) : next()));

  async function apply(base: Trip, ops: Op[], actor: string, reason: string) {
    const next = Trip.parse(applyOps(base, ops));
    const problems = checkTrip(next);
    if (problems.length) return { problems };
    if (!(await store.save({ ...next, id: base.id, revision: base.revision + 1 }, base.revision))) return { conflict: true as const }; // DP-03
    await store.appendLog({ at: new Date().toISOString(), tripId: base.id, actor, reason, ops });
    return { revision: base.revision + 1 };
  }

  app.get("/api/trips", async (c) => c.json((await store.list()).filter((t) => !isLink(c) || t.id === c.get("tripId")).map((t) => view(t, c.get("role")))));
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
    await store.appendLog({ at: new Date().toISOString(), tripId: trip.id, actor: "user", reason: "create", ops: [] });
    return c.json(trip, 201);
  });
  app.get("/api/settings", async (c) => c.json({ ...(await store.loadSettings()), aiService: !!opts.aiService })); // AI-08
  app.put("/api/settings", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403); // AI-09
    const parsed = Settings.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ ok: false, problems: describeError(parsed.error) }, 422);
    await store.saveSettings(parsed.data);
    return c.json(parsed.data);
  });
  app.get("/api/log", async (c) => (need(c, "admin") ? c.json(await store.log()) : c.json({ error: "forbidden" }, 403)));

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
    const { [c.req.param("id")]: _gone, ...links } = await store.links();
    await store.saveLinks(links); // a deleted trip's link must not come back with a new trip of the same id
    await store.appendLog({ at: new Date().toISOString(), tripId: c.req.param("id"), actor: "user", reason: "delete", ops: [] });
    return c.body(null, 204);
  });
  app.get("/api/trips/:id/image", async (c) => {
    const name = (await load(c.req.param("id"))).image;
    const bytes = name ? await store.image(name) : undefined;
    if (!name || !bytes) return c.json({ error: "not found" }, 404);
    // MT-12: an image replaced under the same name must show at once, so the browser revalidates with an ETag of the content.
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
    const etag = `"${[...hash].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
    const headers = { etag, "cache-control": "private, no-cache" };
    if (c.req.header("if-none-match") === etag) return c.body(null, 304, headers);
    return c.body(bytes, 200, { ...headers, "content-type": mime[name.split(".").pop()!] });
  });
  app.get("/api/trips/:id/days/:dayId/traffic", async (c) => {
    const t = await load(c.req.param("id"));
    const day = t.days.find((d) => d.id === c.req.param("dayId"));
    return day ? c.json(await checkTraffic(t, day, opts)) : c.json({ error: "not found" }, 404);
  });
  app.get("/api/trips/:id/check", async (c) => c.json({ problems: checkTrip(await load(c.req.param("id"))) }));
  app.get("/api/trips/:id/proposals", async (c) => (isLink(c) ? c.json({ error: "forbidden" }, 403) : c.json(await store.proposals(c.req.param("id")))));

  // AU-06: the admin creates, reads and replaces a trip's share link; replacing it stops the old one at once.
  app.get("/api/trips/:id/link", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403);
    const secret = (await store.links())[c.req.param("id")];
    return secret ? c.json({ secret }) : c.json({ error: "no link" }, 404);
  });
  app.post("/api/trips/:id/link", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403);
    const secret = newSecret();
    await store.saveLinks({ ...(await store.links()), [c.req.param("id")]: secret });
    return c.json({ secret }, 201);
  });

  app.post("/api/trips/:id/changes", async (c) => {
    const b = await c.req.json<{ baseRevision: number; ops: Op[]; reason?: string; dryRun?: boolean }>();
    if (isLink(c) ? !linkMayChange(b.ops) : !need(c, "propose")) return c.json({ error: "forbidden" }, 403); // MC-10, AU-03
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
    const done = (r: Awaited<ReturnType<typeof apply>>) => ("conflict" in r ? c.json({ error: "conflict" }, 409) : c.json(r));
    if (isLink(c)) return done(await apply(t, b.ops, "link", b.reason ?? "")); // ticks apply at once (AU-03)
    if (c.get("role") !== "admin") {
      const p: Proposal = { id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: b.ops, reason: b.reason ?? "", status: "pending", at: new Date().toISOString() };
      await store.saveProposal(p); // MC-06, MC-07: only an admin applies or approves
      return c.json({ proposalId: p.id, status: p.status }, 202);
    }
    return done(await apply(t, b.ops, "user", b.reason ?? ""));
  });

  app.post("/api/trips/:id/proposals/:pid/:action", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403);
    const p = (await store.proposals(c.req.param("id"))).find((x) => x.id === c.req.param("pid") && x.status === "pending");
    if (!p) return c.json({ error: "not found" }, 404);
    if (c.req.param("action") === "reject") { p.status = "rejected"; await store.saveProposal(p); return c.json(p); }
    const t = await load(p.tripId);
    if (t.revision !== p.baseRevision) return c.json({ error: "conflict", revision: t.revision }, 409);
    const r = await apply(t, p.ops, "llm", p.reason);
    if ("conflict" in r) return c.json({ error: "conflict" }, 409);
    if ("revision" in r) { p.status = "approved"; await store.saveProposal(p); }
    return c.json({ proposal: p, result: r });
  });
  return app;
}
