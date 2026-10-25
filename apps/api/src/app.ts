import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { Settings, Trip, accessFor, applyOps, atLeast, checkTrip, describeError, hiddenFromIn, opNeeds, secretsOf, similarTitles, whoFor, type AccessRole, type Op, type Part } from "@trip/schema";
import { checkTraffic, type TrafficOpts } from "./traffic.ts";

export type Proposal = { id: string; tripId: string; baseRevision: number; ops: Op[]; reason: string; status: "pending" | "approved" | "rejected"; at: string };
export type LogEntry = { at: string; tripId: string; actor: string; reason: string; ops: Op[] };
/** A traveler's personal link to one trip, with the permission Resenär (traveler) or Planerare (planner) (AU-11). */
export type PersonLink = { tripId: string; travelerId: string; secret: string; role: "traveler" | "planner" };

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
  personLinks(): Promise<PersonLink[]>;
  savePersonLinks(l: PersonLink[]): Promise<void>;
  /** Proposals and the change log are kept, so they survive a restart (DP-04, MC-08). */
  proposals(tripId: string): Promise<Proposal[]>;
  saveProposal(p: Proposal): Promise<void>;
  appendLog(e: LogEntry): Promise<void>;
  log(): Promise<LogEntry[]>;
}
export type Tokens = { read: string; propose: string; admin: string };
/** Admin login (AU-04): off when no password is set. The session key signs the cookie. */
export type Auth = { adminPassword?: string; sessionKey?: string };
type Role = "read" | "propose" | "admin" | "link" | "traveler" | "planner";
const rank: Record<Role, number> = { link: 1, read: 1, traveler: 1, propose: 2, planner: 2, admin: 3 };
const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** In-memory store for tests and demos. */
export function memoryStore(trips: unknown[] = [], images: Record<string, Uint8Array<ArrayBuffer>> = {}): Store {
  const m = new Map(trips.map((t) => { const p = Trip.parse(t); return [p.id, p] as const; }));
  let settings = Settings.parse({});
  let links: Record<string, string> = {};
  let people: PersonLink[] = [];
  const proposals = new Map<string, Proposal>(), log: LogEntry[] = [];
  return {
    links: async () => ({ ...links }),
    saveLinks: async (l) => { links = { ...l }; },
    personLinks: async () => structuredClone(people),
    savePersonLinks: async (l) => { people = structuredClone(l); },
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
/** The role a link has in the trip's permissions (AU-20). */
const accessRole = (role: Role): AccessRole | undefined => (role === "link" ? "follower" : role === "traveler" || role === "planner" ? role : undefined);
/** Whether a link's role may make all these changes under the trip's permissions (AU-21, AU-22). Below "write" on expenses,
 * an expense is added one at a time and alone (AU-13). The permissions themselves belong to the superuser. */
function linkMayChange(t: Trip, ar: AccessRole, ops: Op[]) {
  const rules = accessFor(t, ar);
  const ok = ops.length > 0 && ops.every((o) => {
    const n = opNeeds(o);
    return n.part === "access" ? false : n.part === "trip" ? ar === "planner" : atLeast(rules.parts[n.part], n.level);
  });
  const adds = ops.some((o) => o.op === "add" && o.path === "expenses/-");
  return ok && (!adds || rules.parts.expenses === "write" || ops.length === 1);
}
type Activity = Trip["days"][number]["activities"][number];
/** Activities hidden from the viewer, without title, note, places or category, and without places only they use (AU-18).
 * A day's title, summary and timeline label that resemble such an activity are emptied too (AU-27), and the legs of its
 * day lose their places, so no route map gives it away (AU-28). Every other text that resembles an activity hidden from the
 * viewer anywhere in the trip, or links a place whose name does, is emptied and its item marked hidden (AU-30). */
function masked<T extends Omit<Trip, "budgetMax">>(t: T, hiddenFor: (a: Activity) => boolean, hides: (who: string[]) => boolean): T {
  if (!t.days.some((d) => d.activities.some(hiddenFor))) return t;
  const mine = secretsOf(t).filter((x) => hides(x.who));
  const place = (id?: string) => t.places.find((x) => x.id === id);
  const gives = (texts: (string | undefined)[], placeId?: string) => whoFor(mine, [...texts, place(placeId)?.name, place(placeId)?.notes]).length > 0;
  const named = new Set(t.places.filter((x) => gives([x.name, x.notes])).map((x) => x.id)); // never sent (AU-30)
  const dayGives = (d: Trip["days"][number], text: string) => d.activities.some((a) => hiddenFor(a) && similarTitles(a.text, text)) || gives([text]);
  const days = t.days.map((d) => ({
    ...d, ...(dayGives(d, d.title) ? { title: "", hiddenTitle: true } : {}), ...(dayGives(d, d.summary) ? { summary: "", hiddenSummary: true } : {}),
    ...(d.activities.some(hiddenFor) ? { legs: d.legs.map(({ origin, destination, waypoints, ...l }) => ({ ...l, origin: "", destination: "", waypoints: [] })), hiddenRoute: true } : {}),
    activities: d.activities.map((a) => (!hiddenFor(a) ? { ...a, placeIds: a.placeIds.filter((id) => !named.has(id)) }
      : { id: a.id, text: "", placeIds: [], start: a.start, end: a.end, estimated: a.estimated, durationMin: a.durationMin, hidden: true })),
  }));
  const stops = t.stops.map((s) => { const d = t.days.find((x) => x.id === s.dayId); return d && dayGives(d, s.label) ? { ...s, label: "" } : s; });
  const budget = t.budget.map(({ note, ...b }) => (gives([b.category, note]) ? { ...b, category: "", hidden: true } : { ...b, ...(note !== undefined ? { note } : {}) }));
  const bookings = t.bookings.map(({ note, placeId, ...b }) => (gives([b.name, note], placeId) ? { ...b, name: "", hidden: true } : { ...b, ...(note !== undefined ? { note } : {}), ...(placeId ? { placeId } : {}) }));
  const tasks = t.tasks.map(({ placeId, ...k }) => (gives([k.text], placeId) ? { ...k, text: "", hidden: true } : { ...k, ...(placeId ? { placeId } : {}) }));
  const info = t.info.map(({ unsuitable, placeId, ...i }) => (gives([i.title, i.text, unsuitable], placeId) ? { ...i, title: "", text: "", hidden: true }
    : { ...i, ...(unsuitable !== undefined ? { unsuitable } : {}), ...(placeId ? { placeId } : {}) }));
  const expenses = t.expenses.map((e) => (gives([e.text]) ? { ...e, text: "", hidden: true } : e));
  const payments = t.payments.map(({ note, ...x }) => (gives([note]) ? { ...x, hidden: true } : { ...x, ...(note !== undefined ? { note } : {}) }));
  const dreams = t.dreams.map((w) => (gives([w.title, w.source]) ? { ...w, title: "", source: "", hidden: true } : w));
  const trip = { ...(gives([t.purpose]) ? { purpose: "", hiddenPurpose: true } : {}), ...(t.note && gives([t.note]) ? { note: "", hiddenNote: true } : {}) };
  const secret = new Set(t.days.flatMap((d) => d.activities.filter(hiddenFor).flatMap((a) => a.placeIds)));
  const used = new Set([...days.flatMap((d) => d.activities.flatMap((a) => a.placeIds)), ...bookings.map((b) => b.placeId), ...tasks.map((k) => k.placeId), ...info.map((i) => i.placeId)]);
  return { ...t, ...trip, days, stops, budget, bookings, tasks, info, expenses, payments, dreams,
    places: t.places.filter((x) => !named.has(x.id) && (!secret.has(x.id) || used.has(x.id))) } as T;
}
/** The paths where two versions of a trip differ: what the masking changed for the viewer (AU-30). */
function changedPaths(a: unknown, b: unknown, path = ""): string[] {
  if (a === b) return [];
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return [path];
  if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== (b as unknown[]).length)) return [path];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((k) => changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}/${k}` : k));
}
/** True when an operation would change or replace something masked for the viewer; ticking a hidden task is fine (AU-30). */
const touchesMasked = (o: Op, paths: string[]) => !(/^tasks\/\d+\/done$/.test(o.path) && o.op === "set") &&
  paths.some((p) => p === o.path || p.startsWith(`${o.path}/`) || o.path.startsWith(`${p}/`));
/** True when the change hides an activity from the traveler making it, which no one may do (AU-18). */
function hidesFromSelf(before: Trip, after: Trip, travelerId: string) {
  const was = new Map(before.days.flatMap((d) => d.activities).map((a) => [a.id, a.hiddenFrom ?? []]));
  return after.days.flatMap((d) => d.activities).some((a) => a.hiddenFrom?.includes(travelerId) && !was.get(a.id)?.includes(travelerId));
}
/** New expenses from a personal link are paid and added by its traveler; null when one names someone else (AU-13). */
function ownExpenses(ops: Op[], travelerId: string): Op[] | null {
  const out: Op[] = [];
  for (const o of ops) {
    if (o.op !== "add" || o.path !== "expenses/-" || typeof o.value !== "object" || o.value === null) { out.push(o); continue; }
    const v = o.value as { paidBy?: unknown; addedBy?: unknown };
    if ((v.paidBy !== undefined && v.paidBy !== travelerId) || (v.addedBy !== undefined && v.addedBy !== travelerId)) return null;
    out.push({ ...o, value: { ...v, paidBy: travelerId, addedBy: travelerId } });
  }
  return out;
}

type Env = { Variables: { role: Role; tripId?: string; travelerId?: string } };

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

  // Who is calling: an admin session, an MCP token, the common share link or a personal link (AU-01, AU-04, AU-09, AU-11).
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
    const p = /^person\.([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(t); // AU-11
    const l = p ? (await store.personLinks()).find((x) => x.tripId === p[1] && x.travelerId === p[2]) : undefined;
    if (p && l && same(l.secret, p[3]) && (await store.load(l.tripId))?.travelers.some((x) => x.id === l.travelerId)) {
      c.set("role", l.role); c.set("tripId", l.tripId); c.set("travelerId", l.travelerId);
      return next();
    }
    return c.json({ error: "unauthorized" }, 401);
  });
  const need = (c: { get(k: "role"): Role }, min: Role) => rank[c.get("role")] >= rank[min];
  /** Links see one trip only (AU-03, AU-12, AU-14). */
  const scoped = (c: Context<Env>) => ["link", "traveler", "planner"].includes(c.get("role"));
  /** The superuser, or a Planerare for its own trip (AU-14). */
  const manager = (c: Context<Env>) => c.get("role") === "admin" || c.get("role") === "planner";
  /** What a role on a link may see: components hidden by the trip's permissions are left out (AU-17, AU-19, AU-21), booking
   * references never reach a Följare (AU-22), activities hidden from the viewer are masked (AU-18), and the link gets only its
   * own role's rules (AU-20). Read-only tokens get no booking references (MC-11). */
  const view = (t: Trip, role: Role, travelerId?: string, mask = true): Trip => {
    if (role === "read") return { ...t, bookings: t.bookings.map(({ reference, ...b }) => b) };
    const ar = accessRole(role);
    if (!ar) return t;
    const rules = accessFor(t, ar), hide = (p: Part) => rules.parts[p] === "hidden";
    const { budgetMax, access: _all, ...rest } = t;
    const own = t.access?.[ar]; // the role's own choices, so the app shows the same as the server sends
    const out: Trip = { ...rest, ...(!hide("budget") && budgetMax !== undefined ? { budgetMax } : {}), ...(own ? { access: { [ar]: own } } : {}) };
    if (hide("bookings")) out.bookings = [];
    else if (ar === "follower") out.bookings = t.bookings.map(({ reference, ...b }) => b);
    if (hide("budget")) out.budget = [];
    if (hide("expenses")) { out.expenses = []; out.payments = []; }
    if (hide("tasks")) out.tasks = [];
    if (hide("info")) out.info = [];
    if (hide("dreams")) out.dreams = [];
    if (hide("packing")) { out.packing = []; out.packed = []; out.travelers = t.travelers.map((x) => ({ ...x, packing: [], packed: [] })); }
    if (ar === "planner" || !mask) return out;
    const who = new Map(t.days.flatMap((d) => [...hiddenFromIn(d)])); // including activities that resemble a hidden one (AU-24)
    const hides = ar === "follower" ? (w: string[]) => w.length > 0 : (w: string[]) => !!travelerId && w.includes(travelerId); // AU-18
    return masked(out, (a) => hides(who.get(a.id) ?? []), hides);
  };

  app.get("/api/me", (c) => c.json(!scoped(c) ? { role: c.get("role") }
    : { role: c.get("role"), tripId: c.get("tripId"), ...(c.get("travelerId") ? { travelerId: c.get("travelerId") } : {}) }));
  // A link sees one trip only; other trips do not exist for it (AU-03, AU-12, AU-14).
  app.use("/api/trips/:id/*", async (c, next) => (scoped(c) && c.req.param("id") !== c.get("tripId") ? c.json({ error: "not found" }, 404) : next()));
  app.use("/api/trips/:id", async (c, next) => (scoped(c) && c.req.param("id") !== c.get("tripId") ? c.json({ error: "not found" }, 404) : next()));
  app.use("/api/settings", async (c, next) => (scoped(c) ? c.json({ error: "forbidden" }, 403) : next()));

  async function apply(base: Trip, ops: Op[], actor: string, reason: string) {
    const next = Trip.parse(applyOps(base, ops));
    const problems = checkTrip(next);
    if (problems.length) return { problems };
    if (!(await store.save({ ...next, id: base.id, revision: base.revision + 1 }, base.revision))) return { conflict: true as const }; // DP-03
    await store.appendLog({ at: new Date().toISOString(), tripId: base.id, actor, reason, ops });
    return { revision: base.revision + 1 };
  }

  app.get("/api/trips", async (c) => c.json((await store.list()).filter((t) => !scoped(c) || t.id === c.get("tripId")).map((t) => view(t, c.get("role"), c.get("travelerId")))));
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
    return t ? c.json(view(t, c.get("role"), c.get("travelerId"))) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/trips/:id", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403); // MC-07
    if (!(await store.remove(c.req.param("id")))) return c.json({ error: "not found" }, 404);
    const { [c.req.param("id")]: _gone, ...links } = await store.links();
    await store.saveLinks(links); // a deleted trip's links must not come back with a new trip of the same id
    await store.savePersonLinks((await store.personLinks()).filter((l) => l.tripId !== c.req.param("id")));
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
    const t = view(await load(c.req.param("id")), c.get("role"), c.get("travelerId")); // a hidden route is not checked (AU-28)
    const day = t.days.find((d) => d.id === c.req.param("dayId"));
    return day ? c.json(await checkTraffic(t, day, opts)) : c.json({ error: "not found" }, 404);
  });
  app.get("/api/trips/:id/check", async (c) => c.json({ problems: checkTrip(await load(c.req.param("id"))) }));
  app.get("/api/trips/:id/proposals", async (c) => (["link", "traveler"].includes(c.get("role")) ? c.json({ error: "forbidden" }, 403) : c.json(await store.proposals(c.req.param("id")))));

  // AU-06: the admin creates, reads and replaces a trip's share link; replacing it stops the old one at once.
  app.get("/api/trips/:id/link", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const secret = (await store.links())[c.req.param("id")];
    return secret ? c.json({ secret }) : c.json({ error: "no link" }, 404);
  });
  app.post("/api/trips/:id/link", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const secret = newSecret();
    await store.saveLinks({ ...(await store.links()), [c.req.param("id")]: secret });
    return c.json({ secret }, 201);
  });

  // AU-11: personal links per traveler, managed by the superuser or a Planerare of the trip.
  const people = async (tripId: string) => (await store.personLinks()).filter((l) => l.tripId === tripId);
  const shown = (l: PersonLink) => ({ travelerId: l.travelerId, role: l.role, secret: l.secret });
  app.get("/api/trips/:id/people", async (c) => (manager(c) ? c.json((await people(c.req.param("id"))).map(shown)) : c.json({ error: "forbidden" }, 403)));
  app.put("/api/trips/:id/people/:tid", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const tripId = c.req.param("id"), travelerId = c.req.param("tid");
    const { role } = await c.req.json<{ role?: string }>().catch(() => ({ role: undefined }));
    if (role !== "traveler" && role !== "planner") return c.json({ error: "role must be traveler or planner" }, 400);
    if (!(await load(tripId)).travelers.some((x) => x.id === travelerId)) return c.json({ error: "not found" }, 404);
    const all = await store.personLinks(), old = all.find((l) => l.tripId === tripId && l.travelerId === travelerId);
    const next: PersonLink = { tripId, travelerId, role, secret: old?.secret ?? newSecret() }; // a new permission keeps the link
    await store.savePersonLinks([...all.filter((l) => l !== old), next]);
    return c.json(shown(next), old ? 200 : 201);
  });
  app.post("/api/trips/:id/people/:tid/renew", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const all = await store.personLinks(), old = all.find((l) => l.tripId === c.req.param("id") && l.travelerId === c.req.param("tid"));
    if (!old) return c.json({ error: "not found" }, 404);
    const next = { ...old, secret: newSecret() }; // the old link stops working at once
    await store.savePersonLinks([...all.filter((l) => l !== old), next]);
    return c.json(shown(next));
  });
  app.delete("/api/trips/:id/people/:tid", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const all = await store.personLinks(), rest = all.filter((l) => !(l.tripId === c.req.param("id") && l.travelerId === c.req.param("tid")));
    if (rest.length === all.length) return c.json({ error: "not found" }, 404);
    await store.savePersonLinks(rest);
    return c.body(null, 204);
  });

  app.post("/api/trips/:id/changes", async (c) => {
    const b = await c.req.json<{ baseRevision: number; ops: Op[]; reason?: string; dryRun?: boolean }>();
    const role = c.get("role"), travelerId = c.get("travelerId"), ar = accessRole(role);
    const t = await load(c.req.param("id"));
    if (!(ar ? linkMayChange(t, ar, b.ops) : need(c, "propose"))) return c.json({ error: "forbidden" }, 403); // MC-10, AU-21
    if (travelerId) { // AU-13: a personal link adds expenses only in its own name
      const own = ownExpenses(b.ops, travelerId);
      if (!own) return c.json({ error: "forbidden" }, 403);
      b.ops = own;
    }
    // Expenses only add to the list, so they go onto the latest revision (PW-08), and one already recorded is not added again (PW-07).
    const onlyExpenses = b.ops.length > 0 && b.ops.every((o) => o.op === "add" && o.path === "expenses/-");
    if (onlyExpenses) {
      b.ops = b.ops.filter((o) => !t.expenses.some((e) => e.id === (o.value as { id?: unknown })?.id));
      if (!b.ops.length) return c.json({ ok: true, revision: t.revision });
    } else if (b.baseRevision !== t.revision) return c.json({ error: "conflict", revision: t.revision }, 409); // MC-05
    let problems: string[], next: Trip;
    try {
      next = Trip.parse(applyOps(t, b.ops));
      problems = checkTrip(next);
    } catch (e) {
      return c.json({ ok: false, problems: describeError(e) }, 422); // MC-03
    }
    if (travelerId && hidesFromSelf(t, next, travelerId)) return c.json({ error: "forbidden" }, 403); // AU-18
    const hidden = ar && ar !== "planner" ? changedPaths(view(t, c.get("role"), travelerId, false), view(t, c.get("role"), travelerId)) : [];
    if (b.ops.some((o) => touchesMasked(o, hidden))) return c.json({ error: "forbidden" }, 403); // AU-30: no overwriting what one cannot see
    const summary = b.ops.map((o) => `${o.op} ${o.path}`);
    if (b.dryRun) return c.json({ ok: problems.length === 0, problems, summary }); // MC-04
    if (problems.length) return c.json({ ok: false, problems }, 422);
    const done = (r: Awaited<ReturnType<typeof apply>>) => ("conflict" in r ? c.json({ error: "conflict" }, 409) : c.json(r));
    // Personal links apply at once, logged with the traveler's name (AU-12, AU-14, AU-15).
    if (ar) return done(await apply(t, b.ops, travelerId ? t.travelers.find((x) => x.id === travelerId)?.name ?? travelerId : "link", b.reason ?? ""));
    if (c.get("role") !== "admin") {
      const p: Proposal = { id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: b.ops, reason: b.reason ?? "", status: "pending", at: new Date().toISOString() };
      await store.saveProposal(p); // MC-06, MC-07: only an admin applies or approves
      return c.json({ proposalId: p.id, status: p.status }, 202);
    }
    return done(await apply(t, b.ops, "user", b.reason ?? ""));
  });

  app.post("/api/trips/:id/proposals/:pid/:action", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
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
