// Personal links, invitations, accounts and the beta notice (AU-11, US-02..04, US-12, US-26, US-30).
import { Hono, type Context } from "hono";
import { firstSuper, normEmail, publicUser, SETUP_DAYS, sha256, validEmail, type User } from "../users.ts";
import { type Env, type PersonLink, newSecret, slug } from "./shared.ts";
import type { Ctx } from "./ctx.ts";

export function peopleRoutes(app: Hono<Env>, k: Ctx) {
  const { store, clock, scoped, manager, load, people } = k;
  // AU-11: personal links per traveler, managed by the superuser or a Planerare of the trip.
  /** US-36: whether the traveler's account can log in, has only been invited, or is missing or disabled. */
  const loginOf = (l: PersonLink, users: User[]) => {
    const u = l.account ? users.find((x) => x.email === l.account) : undefined;
    return !u ? "none" : u.disabled ? "disabled" : u.passwordHash || u.googleId ? "active" : "invited";
  };
  const shown = async (l: PersonLink, users?: User[]) => ({ travelerId: l.travelerId, role: l.role, secret: l.secret,
    ...(l.account ? { account: l.account, login: loginOf(l, users ?? await store.users()) } : {}) });
  app.get("/api/trips/:id/people", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const users = await store.users();
    return c.json(await Promise.all((await people(c.req.param("id"))).map((l) => shown(l, users))));
  });
  app.put("/api/trips/:id/people/:tid", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const tripId = c.req.param("id"), travelerId = c.req.param("tid");
    const { role, account } = await c.req.json<{ role?: string; account?: unknown }>().catch(() => ({ role: undefined, account: undefined }));
    if (role !== "traveler" && role !== "planner") return c.json({ error: "role must be traveler or planner" }, 400);
    if (!(await load(tripId)).travelers.some((x) => x.id === travelerId)) return c.json({ error: "not found" }, 404);
    const all = await store.personLinks(), old = all.find((l) => l.tripId === tripId && l.travelerId === travelerId);
    // US-21: the traveler's account address; left out keeps it, null or empty clears it. Nothing tells whether an account has it.
    const address = account === undefined ? old?.account : typeof account === "string" && account.trim() ? normEmail(account) : account === null || account === "" ? undefined : false;
    if (address === false || (address && !validEmail(address))) return c.json({ error: "bad address" }, 400);
    if (address && all.some((l) => l.tripId === tripId && l.travelerId !== travelerId && l.account === address)) return c.json({ error: "address in use" }, 409);
    const next: PersonLink = { tripId, travelerId, role, secret: old?.secret ?? newSecret(), ...(address ? { account: address } : {}) }; // a new permission keeps the link
    await store.savePersonLinks([...all.filter((l) => l !== old), next]);
    return c.json(await shown(next), old ? 200 : 201);
  });
  app.post("/api/trips/:id/people/:tid/renew", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const all = await store.personLinks(), old = all.find((l) => l.tripId === c.req.param("id") && l.travelerId === c.req.param("tid"));
    if (!old) return c.json({ error: "not found" }, 404);
    const next = { ...old, secret: newSecret() }; // the old link stops working at once
    await store.savePersonLinks([...all.filter((l) => l !== old), next]);
    await store.removePushSubs(old.tripId, { who: old.travelerId }); // NT-05
    return c.json(await shown(next));
  });
  app.delete("/api/trips/:id/people/:tid", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const all = await store.personLinks(), rest = all.filter((l) => !(l.tripId === c.req.param("id") && l.travelerId === c.req.param("tid")));
    if (rest.length === all.length) return c.json({ error: "not found" }, 404);
    await store.savePersonLinks(rest);
    await store.removePushSubs(c.req.param("id"), { who: c.req.param("tid") }); // NT-05
    return c.body(null, 204);
  });

  // US-02, US-03, US-04, US-12: the superuser manages the accounts; the admin password acts as the first superuser (US-18).
  const superOnly = async (c: Context<Env>, next: () => Promise<void>) => (c.get("role") === "admin" && !scoped(c) ? next() : c.json({ error: "forbidden" }, 403));
  app.use("/api/users", superOnly);
  app.use("/api/users/*", superOnly);
  const selfOf = async (c: Context<Env>) => c.get("user")?.id ?? firstSuper(await store.users())?.id;
  /** A new password link: the secret goes to the superuser once, only its hash is kept (US-04). */
  const newSetup = async (u: User) => {
    const secret = newSecret(), expires = new Date(clock().getTime() + SETUP_DAYS * 86_400_000).toISOString();
    await store.saveUser({ ...u, setup: { hash: await sha256(secret), expires } });
    return { secret, expires };
  };
  app.get("/api/users", async (c) => c.json((await store.users()).map(publicUser)));
  // US-30: whoever manages a trip invites a traveler with an address: an account and a password link, or a new link for an account
  // that never logged in; an account that can log in already gets none.
  app.post("/api/trips/:id/people/:tid/invite", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const t = await load(c.req.param("id")), x = t.travelers.find((y) => y.id === c.req.param("tid"));
    const address = (await people(t.id)).find((l) => l.travelerId === x?.id)?.account;
    if (!x || !address) return c.json({ error: "no address" }, 409);
    const users = await store.users(), me = await selfOf(c), u = users.find((y) => y.email === address);
    if (!u) {
      let id = slug(x.name);
      for (let n = 2; users.some((y) => y.id === id); n++) id = `${slug(x.name)}-${n}`;
      const made: User = { id, name: x.name, email: address, superuser: false, disabled: false, ai: false, createdAt: clock().toISOString(), ...(me ? { invitedBy: me } : {}) };
      return c.json({ user: id, setup: await newSetup(made) }, 201);
    }
    if (!u.superuser && !u.disabled && !u.passwordHash && !u.googleId) return c.json({ user: u.id, setup: await newSetup(u) });
    return c.json(u.disabled ? { exists: true, disabled: true } : { exists: true }); // US-37; a forgotten password is mailed (US-35)
  });
  app.post("/api/users", async (c) => {
    const b = await c.req.json<{ name?: unknown; email?: unknown }>().catch(() => ({} as { name?: unknown; email?: unknown }));
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "", email = typeof b.email === "string" ? normEmail(b.email) : "";
    if (!name || !validEmail(email)) return c.json({ error: "name and a valid address needed" }, 400);
    const users = await store.users();
    if (users.some((u) => u.email === email)) return c.json({ error: "address in use" }, 409);
    let id = slug(name);
    for (let n = 2; users.some((u) => u.id === id); n++) id = `${slug(name)}-${n}`;
    const u: User = { id, name, email, superuser: users.length === 0, disabled: false, ai: false, createdAt: clock().toISOString() }; // the first account is the superuser
    if (users.length === 0) for (const t of await store.list()) if (!(await store.owners())[t.id]) await store.saveOwner(t.id, id); // US-13: the trips so far
    return c.json({ user: publicUser(u), setup: await newSetup(u) }, 201);
  });
  /** The account in the path, and whether a change would leave no superuser who can log in (US-12). */
  const target = async (c: Context<Env>) => {
    const users = await store.users(), u = users.find((x) => x.id === c.req.param("uid"));
    const lastSuper = (next?: User) => !users.map((x) => (x.id === next?.id ? next : x)).some((x) => x.superuser && !x.disabled);
    return { u, self: u?.id === await selfOf(c), lastSuper };
  };
  app.patch("/api/users/:uid", async (c) => {
    const { u, self, lastSuper } = await target(c);
    if (!u) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ disabled?: unknown; superuser?: unknown; ai?: unknown }>().catch(() => ({} as Record<string, unknown>));
    const next: User = { ...u, ...(typeof b.disabled === "boolean" ? { disabled: b.disabled } : {}), ...(typeof b.superuser === "boolean" ? { superuser: b.superuser } : {}), ...(typeof b.ai === "boolean" ? { ai: b.ai } : {}) };
    if ((self && (next.disabled || !next.superuser)) || lastSuper(next)) return c.json({ error: "forbidden" }, 403); // never oneself, never the last one
    await store.saveUser(next);
    return c.json(publicUser(next));
  });
  app.post("/api/users/:uid/setup", async (c) => {
    const { u } = await target(c);
    return u ? c.json(await newSetup(u)) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/users/:uid", async (c) => {
    const { u, self, lastSuper } = await target(c);
    if (!u) return c.json({ error: "not found" }, 404);
    if (self || lastSuper({ ...u, disabled: true })) return c.json({ error: "forbidden" }, 403);
    const heir = await selfOf(c);
    for (const [tripId, owner] of Object.entries(await store.owners())) if (owner === u.id) await store.saveOwner(tripId, heir ?? null); // US-13
    await store.removeUser(u.id);
    return c.body(null, 204);
  });

}
