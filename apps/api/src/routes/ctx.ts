// The helpers every route area uses: the caller's role, a trip as that role sees it, saving a change and the notice about it.
import { Trip, accessFor, applyOps, checkTrip, hiddenFromIn, type Op, type Part } from "@trip/schema";
import { describeChange, noticeBody } from "../notify.ts";
import { pushRequest } from "../push.ts";
import { sv } from "../../../web/src/sv.ts";
import { memberships, type User } from "../users.ts";
import type { Context } from "hono";
import { type AppOpts, type Env, type Role, type Store, type Tokens, accessRole, fileIdsOf, masked, proposalFiles, rank, withoutDismissed, withoutInbox, withoutWishInbox, wishFiles } from "./shared.ts";

export function makeCtx(store: Store, tokens: Tokens, opts: AppOpts) {
  const { adminPassword, sessionKey, google } = opts.auth ?? {};
  const clock = () => opts.now?.() ?? new Date();
  /** A user's roles in every trip they reach (US-13, US-14, US-22). */
  const membersOf = async (u: User, trips?: Trip[]) =>
    memberships(u, await store.users(), trips ?? await store.list(), await store.owners(), await store.personLinks());
  // US-14, US-22: on a trip, a user gets the role they have there; a trip they do not reach does not exist for them.
  const need = (c: { get(k: "role"): Role }, min: Role) => rank[c.get("role")] >= rank[min];
  /** Links see one trip only (AU-03, AU-12, AU-14). */
  const scoped = (c: Context<Env>) => ["link", "traveler", "planner"].includes(c.get("role"));
  /** The superuser or the trip's owner: everything on the trip (US-14). */
  const full = (c: Context<Env>) => c.get("role") === "admin" || c.get("role") === "owner";
  /** The superuser, the owner, or a Planerare for its own trip (AU-14, US-14). */
  const manager = (c: Context<Env>) => full(c) || c.get("role") === "planner";
  /** What a role on a link may see: components hidden by the trip's permissions are left out (AU-17, AU-19, AU-21), booking
   * references never reach a Följare (AU-22), activities hidden from the viewer are masked (AU-18), and the link gets only its
   * own role's rules (AU-20). Read-only tokens get no booking references (MC-11). */
  const view = (t: Trip, role: Role, travelerId?: string, mask = true): Trip => {
    if (role === "read") return { ...withoutWishInbox(withoutInbox(t)), bookings: t.bookings.map(({ reference, files, ...b }) => b) }; // MC-11, BK-11
    const ar = accessRole(role);
    if (!ar) return t;
    const rules = accessFor(t, ar), hide = (p: Part) => rules.parts[p] === "hidden";
    const { budgetMax, access: _all, wishInbox: _w, ...rest } = ar === "planner" ? t : withoutDismissed(withoutInbox(t)); // the address: BK-26, below
    const own = ar === "planner" ? undefined : t.access?.[ar]; // the role's own choices, so the app shows the same as the server sends
    const out: Trip = { ...rest, ...(!hide("budget") && budgetMax !== undefined ? { budgetMax } : {}), ...(own ? { access: { [ar]: own } } : {}) };
    if (hide("bookings")) out.bookings = [];
    else if (ar === "follower") out.bookings = t.bookings.map(({ reference, files, ...b }) => b); // AU-22, BK-11
    if (hide("budget")) out.budget = [];
    if (hide("expenses")) { out.expenses = []; out.payments = []; }
    if (hide("tasks")) out.tasks = [];
    if (hide("info")) out.info = [];
    if (hide("dreams")) out.dreams = [];
    if (ar === "traveler" && !hide("dreams") && t.inbox) out.inbox = t.inbox; // BK-26: a Resenär who sees wishes may mail in
    if ((rules.view.mi.memories ?? "hidden") === "hidden") { out.memories = []; delete out.album; } // MI-21
    else if (ar !== "planner") out.memories = t.memories.map(({ note, ...m }) => (note !== undefined && m.by === travelerId ? { ...m, note } : m)); // MI-18: only one's own comment
    if (hide("packing")) { out.packing = []; out.packed = []; out.travelers = t.travelers.map((x) => ({ ...x, packing: [], packed: [] })); }
    if (ar === "planner" || !mask) return out;
    const who = new Map(t.days.flatMap((d) => [...hiddenFromIn(d)])); // including activities that resemble a hidden one (AU-24)
    const hides = ar === "follower" ? (w: string[]) => w.length > 0 : (w: string[]) => !!travelerId && w.includes(travelerId); // AU-18
    return masked(out, (a) => hides(who.get(a.id) ?? []), hides);
  };

  /** Work that goes on after the answer: kept alive in the Worker, on its own in Node. */
  const later = (c: Context<Env>, p: Promise<unknown>) => { const q = p.catch(() => {}); try { c.executionCtx.waitUntil(q); } catch { /* Node */ } };
  /** Who made a change, as notices compare it with each subscription (NT-01). */
  const whoOf = (c: Context<Env>) => c.get("travelerId") ?? (c.get("role") === "link" ? "follower" : "admin");
  /** The name a change is logged with: the traveler of a personal link, or "user" for the superuser (AU-15). */
  const actorName = (c: Context<Env>, t: Trip) => { const id = c.get("travelerId"); return id ? t.travelers.find((x) => x.id === id)?.name ?? id : c.get("user")?.name ?? "user"; }; // US-17
  /** A notice to every other phone with notices on, each described from its own view of the trip (NT-01, NT-02, NT-05). */
  async function notify(before: Trip, after: Trip, who: string, name: string, origin: string) {
    if (!opts.vapidKey) return;
    const people = await store.personLinks();
    for (const s of (await store.pushSubs(before.id)).filter((x) => x.who !== who)) {
      const role: Role | undefined = s.who === "admin" ? "admin" : s.who === "follower" ? "link" : people.find((l) => l.tripId === before.id && l.travelerId === s.who)?.role;
      if (!role) { await store.removePushSubs(before.id, { who: s.who }); continue; } // the link is gone
      const id = role === "traveler" || role === "planner" ? s.who : undefined;
      const lines = describeChange(view(before, role, id), view(after, role, id), name);
      if (!lines.length) continue;
      const payload = JSON.stringify({ title: after.title, body: noticeBody(lines), tripId: after.id });
      const r = await pushRequest({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, opts.vapidKey, origin);
      const res = await (opts.fetch ?? fetch)(r.url, { method: "POST", headers: r.headers, body: r.body }).catch(() => undefined);
      if (res && (res.status === 404 || res.status === 410)) await store.removePushSubs(before.id, { endpoint: s.endpoint }); // NT-05
    }
  }

  async function apply(base: Trip, ops: Op[], actor: string, reason: string, notice?: { c: Context<Env>; who: string }) {
    const next = Trip.parse(applyOps(base, ops));
    const problems = checkTrip(next);
    if (problems.length) return { problems };
    if (!(await store.save({ ...next, id: base.id, revision: base.revision + 1 }, base.revision))) return { conflict: true as const }; // DP-03
    await store.appendLog({ at: new Date().toISOString(), tripId: base.id, actor, reason, ops });
    await opts.onChange?.(base.id).catch(() => {}); // AI-69
    const kept = new Set([...fileIdsOf(next.bookings), ...wishFiles(next.dreams, true), ...proposalFiles(await store.proposals(base.id))]);
    const gone = [...fileIdsOf(base.bookings), ...wishFiles(base.dreams, true)].filter((id) => !kept.has(id));
    if (gone.length) await store.removeFiles(gone); // BK-13, DB-08
    if (notice) later(notice.c, notify(base, next, notice.who, notice.who === "admin" && !notice.c.get("user") ? sv.notice.admin : actor, new URL(notice.c.req.url).origin)); // US-17
    return { revision: base.revision + 1 };
  }
  const load = async (id: string) => (await store.load(id))!;
  const people = async (tripId: string) => (await store.personLinks()).filter((l) => l.tripId === tripId);
  return { store, tokens, opts, adminPassword, sessionKey, google, clock, membersOf, need, scoped, full, manager, view, later, whoOf, actorName, apply, load, people };
}
/** What an area of routes is given by createApp. */
export type Ctx = ReturnType<typeof makeCtx>;
