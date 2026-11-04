// The API: createApp builds the app, checks who is calling and mounts the areas of routes/ (DP-19 map).
import { Hono, type Context } from "hono";
import { getSignedCookie } from "hono/cookie";
import { type Env, type Store, type Tokens, type AppOpts, same } from "./routes/shared.ts";
import { makeCtx } from "./routes/ctx.ts";
import { authRoutes } from "./routes/auth.ts";
import { tripRoutes } from "./routes/trips.ts";
import { peopleRoutes } from "./routes/people.ts";
import { miscRoutes } from "./routes/misc.ts";
import { bookingRoutes } from "./routes/bookings.ts";
import { dreamRoutes } from "./routes/dreams.ts";
import { aiRoutes } from "./routes/ai.ts";
import { securityHeaders } from "./security-headers.ts";

// Callers import the store, its types and the helpers from here as before.
export * from "./routes/shared.ts";


/** onChange: told after every saved change of a trip, to start its AI timer (AI-69). */
/** mail: the mail service and the app's own address, for the links it sends (US-35). */
export function createApp(store: Store, tokens: Tokens, opts: AppOpts = {}) {
  const app = new Hono<Env>();
  const k = makeCtx(store, tokens, opts);
  const { sessionKey, membersOf, scoped } = k;
  app.use("*", securityHeaders); // SP-12: first, so it covers every route
  authRoutes(app, k);

  // Who is calling: an admin or account session, an MCP token, the common share link or a personal link (AU-01, AU-04, AU-09, AU-11, US-11).
  app.use("/api/*", async (c, next) => {
    if (sessionKey) {
      const v = await getSignedCookie(c, sessionKey, "session");
      const [kind, a, b, gen] = v ? v.split(".") : [];
      if (kind === "admin" && Number(a) * 1000 > Date.now()) { c.set("role", "admin"); return next(); }
      if (kind === "user" && Number(b) * 1000 > Date.now()) {
        const u = (await store.users()).find((x) => x.id === a); // checked on every request, so a disabled account is out at once
        if (u && !u.disabled && Number(gen ?? 0) === (u.sessions ?? 0)) { c.set("user", u); c.set("role", u.superuser ? "admin" : "account"); return next(); }
      }
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
  const tripRole = async (c: Context<Env>, next: () => Promise<void>) => {
    const u = c.get("user"), id = c.req.param("id");
    if (!u || !id || c.get("tripId")) return next();
    const t = await store.load(id);
    const m = t && (await membersOf(u, [t]))[id];
    if (!m) return c.json({ error: "not found" }, 404);
    c.set("role", m.role); c.set("tripId", id);
    if (m.role === "traveler" || m.role === "planner") c.set("travelerId", m.travelerId);
    return next();
  };
  app.use("/api/trips/:id/*", tripRole);
  app.use("/api/trips/:id", tripRole);
  app.get("/api/me", async (c) => {
    const u = c.get("user");
    if (u) return c.json({ role: c.get("role"), user: { id: u.id, name: u.name, superuser: u.superuser }, trips: await membersOf(u), consent: !!u.consentAt }); // US-22, US-40, US-26
    return c.json(!scoped(c) ? { role: c.get("role") }
      : { role: c.get("role"), tripId: c.get("tripId"), ...(c.get("travelerId") ? { travelerId: c.get("travelerId") } : {}) });
  });
  // A link sees one trip only; other trips do not exist for it (AU-03, AU-12, AU-14).
  app.use("/api/trips/:id/*", async (c, next) => (scoped(c) && c.req.param("id") !== c.get("tripId") ? c.json({ error: "not found" }, 404) : next()));
  app.use("/api/trips/:id", async (c, next) => (scoped(c) && c.req.param("id") !== c.get("tripId") ? c.json({ error: "not found" }, 404) : next()));
  app.use("/api/settings", async (c, next) => (scoped(c) ? c.json({ error: "forbidden" }, 403) : next()));

  app.use("/api/trips/:id/*", async (c, next) => ((await store.load(c.req.param("id"))) ? next() : c.json({ error: "not found" }, 404)));

  tripRoutes(app, k);
  peopleRoutes(app, k);
  miscRoutes(app, k);
  const ai = aiRoutes(app, k);
  bookingRoutes(app, k, ai.askKind);
  dreamRoutes(app, k);
  return Object.assign(app, { aiTick: ai.aiTick, receive: ai.receive });
}
