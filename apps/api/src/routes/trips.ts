// A trip: the list, settings, log, one trip, its traffic and transit, changes and the days used (AU-06, US-28, AI-08, TR-23, ED-*).
import { Hono } from "hono";
import { Settings, Trip, applyOps, checkTrip, pinBreaks, describeError, type Op } from "@trip/schema";
import { checkTraffic } from "../traffic.ts";
import { checkTransit } from "../transit.ts";
import { sv } from "../../../web/src/sv.ts";
import { firstSuper } from "../users.ts";
import { type Env, type Proposal, accessRole, approvesExpense, changedPaths, hidesFromSelf, linkMayChange, mime, newSecret, othersMemories, ownExpenses, same, slug, touchesMasked } from "./shared.ts";
import type { Ctx } from "./ctx.ts";

export function tripRoutes(app: Hono<Env>, k: Ctx) {
  const { store, opts, clock, membersOf, need, scoped, full, manager, view, whoOf, actorName, apply, load } = k;
  app.get("/api/trips", async (c) => {
    const all = await store.list(), u = c.get("user");
    if (u) { // US-14, US-15, US-22: a user's own trips and the ones they travel on, each seen with the role they have there
      const m = await membersOf(u, all);
      return c.json(all.filter((t) => m[t.id]).map((t) => view(t, m[t.id]!.role, m[t.id]!.role === "traveler" || m[t.id]!.role === "planner" ? m[t.id]!.travelerId : undefined)));
    }
    return c.json(all.filter((t) => !scoped(c) || t.id === c.get("tripId")).map((t) => view(t, c.get("role"), c.get("travelerId"))));
  });
  app.post("/api/trips", async (c) => {
    if (!need(c, "admin") && c.get("role") !== "account") return c.json({ error: "forbidden" }, 403); // US-14: every user creates trips
    const b = await c.req.json<{ title?: string; purpose?: string }>().catch(() => ({ title: undefined, purpose: undefined }));
    const title = b.title?.trim();
    if (!title) return c.json({ error: "title required" }, 400);
    const creator = c.get("user") ?? (c.get("role") === "admin" ? firstSuper(await store.users()) : undefined); // US-13, US-18
    const first = creator?.name.trim().split(/\s+/)[0]; // US-39: the creator is the first traveler, a Planerare tied to the account
    const trip = Trip.parse({
      id: `${slug(title)}-${crypto.randomUUID().slice(0, 6)}`, revision: 1, title, purpose: b.purpose ?? "", timezone: "Europe/Stockholm",
      stops: [], days: [], places: [], bookings: [], tasks: [], travelers: first ? [{ id: slug(first), name: first, packing: [] }] : [],
    });
    if (creator && first) await store.savePersonLinks([...await store.personLinks(), { tripId: trip.id, travelerId: slug(first), role: "planner", secret: newSecret(), account: creator.email }]);
    await store.save(trip);
    if (creator) await store.saveOwner(trip.id, creator.id);
    await store.appendLog({ at: new Date().toISOString(), tripId: trip.id, actor: c.get("user")?.name ?? "user", reason: "create", ops: [] });
    return c.json(trip, 201);
  });
  app.get("/api/settings", async (c) => { // AI-08; US-16: the AI service only for users allowed it
    const u = c.get("user");
    const allowed = !u || u.superuser || u.ai;
    return c.json({ ...(await store.loadSettings()), aiService: !!opts.aiService && allowed, ...(opts.aiService && !allowed ? { aiAccount: false } : {}) }); // AI-99: the account, not the instance, lacks AI
  });
  app.put("/api/settings", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403); // AI-09
    const parsed = Settings.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ ok: false, problems: describeError(parsed.error) }, 422);
    await store.saveSettings(parsed.data);
    return c.json(parsed.data);
  });
  app.get("/api/log", async (c) => (need(c, "admin") ? c.json(await store.log()) : c.json({ error: "forbidden" }, 403)));
  app.get("/api/trips/:id", async (c) => {
    const t = await store.load(c.req.param("id"));
    return t ? c.json(view(t, c.get("role"), c.get("travelerId"))) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/trips/:id", async (c) => {
    if (!full(c)) return c.json({ error: "forbidden" }, 403); // MC-07; US-14: the owner deletes their own trip
    if (!(await store.remove(c.req.param("id")))) return c.json({ error: "not found" }, 404);
    await store.saveOwner(c.req.param("id"), null);
    const { [c.req.param("id")]: _gone, ...links } = await store.links();
    await store.saveLinks(links); // a deleted trip's links must not come back with a new trip of the same id
    await store.savePersonLinks((await store.personLinks()).filter((l) => l.tripId !== c.req.param("id")));
    await store.appendLog({ at: new Date().toISOString(), tripId: c.req.param("id"), actor: c.get("user")?.name ?? "user", reason: "delete", ops: [] });
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
  // TR-23: public transport to an activity, asked for when the button is pressed; a hidden route is not asked for (AU-28).
  app.get("/api/trips/:id/days/:dayId/activities/:aid/transit", async (c) => {
    const t = view(await load(c.req.param("id")), c.get("role"), c.get("travelerId"));
    const day = t.days.find((d) => d.id === c.req.param("dayId"));
    if (!day) return c.json({ error: "not found" }, 404);
    const from = c.req.query("from"), m = from === undefined ? undefined : /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(from);
    if (from !== undefined && (!m || Math.abs(+m[1]!) > 90 || Math.abs(+m[2]!) > 180)) return c.json({ error: "from must be lat,lng" }, 400);
    return c.json(day.hiddenRoute ? { status: "none" } : await checkTransit(t, day.id, c.req.param("aid"), opts, m ? { lat: +m[1]!, lng: +m[2]! } : undefined)); // the phone's position, when no place is before
  });
  app.get("/api/trips/:id/check", async (c) => c.json({ problems: checkTrip(await load(c.req.param("id"))) }));
  app.get("/api/trips/:id/proposals", async (c) => (["link", "traveler"].includes(c.get("role")) ? c.json({ error: "forbidden" }, 403)
    : c.json((await store.proposals(c.req.param("id"))).map(({ mailText: _m, ...p }) => p)))); // the mail's text stays on the server (AI-60)

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
    await store.removePushSubs(c.req.param("id"), { who: "follower" }); // the old link's phones (NT-05)
    return c.json({ secret }, 201);
  });
  app.post("/api/trips/:id/changes", async (c) => {
    const b = await c.req.json<{ baseRevision: number; ops: Op[]; reason?: string; dryRun?: boolean }>();
    const role = c.get("role"), travelerId = c.get("travelerId"), ar = accessRole(role);
    const t = await load(c.req.param("id"));
    if (!(ar ? linkMayChange(t, ar, b.ops, travelerId) : need(c, "propose"))) return c.json({ error: "forbidden" }, 403); // MC-10, AU-21
    if (travelerId) { // AU-13: a personal link adds expenses only in its own name
      const own = ownExpenses(b.ops, travelerId);
      if (!own) return c.json({ error: "forbidden" }, 403);
      b.ops = own;
    }
    if (ar === "traveler") b.ops = b.ops.map((o) => (o.op === "add" && o.path === "expenses/-" ? { ...o, value: { ...(o.value as object), pending: true } } : o)); // MI-09
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
      if (!ar && !full(c)) problems.push(...pinBreaks(t, next).map(sv.proposal.pin)); // MC-20: an LLM client leaves pins alone, also in a dry run
    } catch (e) {
      return c.json({ ok: false, problems: describeError(e) }, 422); // MC-03
    }
    if (travelerId && hidesFromSelf(t, next, travelerId)) return c.json({ error: "forbidden" }, 403); // AU-18
    if (travelerId && othersMemories(t, next, travelerId)) return c.json({ error: "forbidden" }, 403); // MI-22
    if (ar === "traveler" && approvesExpense(t, next)) return c.json({ error: "forbidden" }, 403); // MI-12
    const hidden = ar && ar !== "planner" ? changedPaths(view(t, c.get("role"), travelerId, false), view(t, c.get("role"), travelerId)) : [];
    if (b.ops.some((o) => touchesMasked(o, hidden))) return c.json({ error: "forbidden" }, 403); // AU-30: no overwriting what one cannot see
    const summary = b.ops.map((o) => `${o.op} ${o.path}`);
    if (b.dryRun) return c.json({ ok: problems.length === 0, problems, summary }); // MC-04
    if (problems.length) return c.json({ ok: false, problems }, 422);
    const done = (r: Awaited<ReturnType<typeof apply>>) => ("conflict" in r ? c.json({ error: "conflict" }, 409) : c.json(r));
    // Personal links apply at once, logged with the traveler's name (AU-12, AU-14, AU-15).
    if (ar) return done(await apply(t, b.ops, travelerId ? t.travelers.find((x) => x.id === travelerId)?.name ?? travelerId : "link", b.reason ?? "", { c, who: whoOf(c) }));
    if (!full(c)) {
      const p: Proposal = { id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: b.ops, reason: b.reason ?? "", status: "pending", at: new Date().toISOString() };
      await store.saveProposal(p); // MC-06, MC-07: only an admin applies or approves
      return c.json({ proposalId: p.id, status: p.status }, 202);
    }
    return done(await apply(t, b.ops, actorName(c, t), b.reason ?? "", { c, who: whoOf(c) }));
  });
  const dayIn = (tz: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(clock());
  // US-28: a consenting user opened one of the trip's four pages today; kept once per day.
  app.post("/api/trips/:id/seen", async (c) => {
    const u = c.get("user");
    if (!u?.consentAt) return c.body(null, 204); // nothing is kept without the notice accepted
    const { tab } = await c.req.json<{ tab?: unknown }>().catch(() => ({ tab: undefined }));
    if (tab !== "dr" && tab !== "nala" && tab !== "up" && tab !== "mi") return c.json({ error: "unknown page" }, 400);
    const t = await load(c.req.param("id"));
    await store.saveUsage({ tripId: t.id, who: u.id, tab, day: dayIn(t.timezone) });
    return c.body(null, 204);
  });
}
