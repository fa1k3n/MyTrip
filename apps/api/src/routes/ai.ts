// AI features on a trip: consent, the helpers and their runs, reading mail and receipts, usage (AI-03, AI-60, AI-64..72, US-29).
import { Hono, type Context } from "hono";
import { imageType } from "../wishimage.ts";
import { CAP_ACCOUNT_USD, CAP_USD, Settings, Trip, aiOn, aiOnForTrip, type BookingReading, type Op } from "@trip/schema";
import { mailForAi, readBookingAi, readMailKindAi, readReceiptAi, type ReadOut } from "../ai-read.ts";
import { aiText, NO_COST, runAi, sameSuggestion, type AiCall, type AiFeature, type AiResult } from "../ai.ts";
import { FEATURES } from "../ai-features.ts";
import { sv } from "../../../web/src/sv.ts";
import { receiveMail, type AskKind } from "../mail.ts";
import { firstSuper, sha256 } from "../users.ts";
import { AI_RUN_ESTIMATE_USD, type AiUse, type Env, MAX_FILE, type Proposal, type Usage, onItsDay, same, toBase64 } from "./shared.ts";
import type { Ctx } from "./ctx.ts";

export function aiRoutes(app: Hono<Env>, k: Ctx) {
  const { store, opts, clock, scoped, manager, whoOf, actorName, apply, load, people } = k;
  const features = () => opts.ai?.features ?? FEATURES;
  const featureOf = (name: string) => (Object.hasOwn(features(), name) ? features()[name] : undefined);
  // AI-64: someone who plans the trip agrees, once per trip, before any of it is sent to the AI service;
  // AI-68: the helper whose switch asked for it is turned on in the same change.
  app.post("/api/trips/:id/ai/consent", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const t = await load(c.req.param("id")), actor = actorName(c, t);
    const { helper } = await c.req.json<{ helper?: unknown }>().catch(() => ({ helper: undefined }));
    const on = typeof helper === "string" && featureOf(helper)?.helper ? [{ op: "set" as const, path: "aiHelpers", value: { ...t.aiHelpers, [helper]: true } }] : [];
    const r = await apply(t, [{ op: "set", path: "aiConsent", value: { by: actor, at: clock().toISOString() } }, ...on], actor, "ai consent");
    return "revision" in r ? c.json(r) : c.json({ error: "conflict" }, 409);
  });
  /** AI-07, AI-62: the feature's capability, and the web for one that searches, are on for the instance and the trip. */
  const mayRun = (s: Settings, f: AiFeature, t: Trip) => aiOnForTrip(s, f.area, true, t) && (!f.web || aiOn(s, "web", true));
  /** The same without the trip's switch: a helper the app lists, greyed while the trip's switch is off (AI-74). */
  const offered = (s: Settings, f: AiFeature) => aiOn(s, f.area, true) && (!f.web || aiOn(s, "web", true));
  const spent = (xs: AiUse[]) => xs.reduce((n, x) => n + x.usd, 0);
  /** Which cap stops a person this month, if any (AI-03). */
  /** AI-03; the superuser (the admin password or a superuser account) has only the instance's cap (AI-92). */
  const capReached = async (s: Settings, uses: AiUse[], who: string) => (spent(uses) >= (s.ai.capUsd ?? CAP_USD) ? "instance"
    : who === "admin" || (await store.users()).some((u) => u.id === who && u.superuser) ? undefined
    : spent(uses.filter((x) => x.who === who)) >= (s.ai.capAccountUsd ?? CAP_ACCOUNT_USD) ? "account" : undefined);
  /** About how many more runs of a feature a person has this month (AI-72). */
  const runsLeft = (s: Settings, uses: AiUse[], all: AiUse[], who: string, name: string) => {
    const left = Math.min((s.ai.capUsd ?? CAP_USD) - spent(uses), (s.ai.capAccountUsd ?? CAP_ACCOUNT_USD) - spent(uses.filter((x) => x.who === who)));
    const last = all.filter((x) => x.feature === name && x.usd > 0).slice(-10);
    return Math.max(0, Math.floor(left / (last.length ? spent(last) / last.length : AI_RUN_ESTIMATE_USD) + 1e-9));
  };
  /** AI-14: the memories of the owner's earlier trips as the AI service may see them: per wish its title, category, the counts of each
   * verdict and the comments, never who; names and numbers removed (AI-04). The latest trips first, at most 60 wishes. */
  async function earlierMemories(t: Trip) {
    const owners = await store.owners(), first = firstSuper(await store.users())?.id, ownerOf = (id: string) => owners[id] ?? first;
    const last = (x: Trip) => x.days.map((d) => d.date).sort().at(-1) ?? "";
    const earlier = (await store.list()).filter((x) => x.id !== t.id && ownerOf(x.id) === ownerOf(t.id) && x.memories.length).sort((a, b) => last(b).localeCompare(last(a)));
    const items = earlier.flatMap((x) => x.dreams.flatMap((w) => {
      const own = x.memories.filter((m) => m.dreamId === w.id), n = (v: string) => own.filter((m) => m.verdict === v).length;
      const comments = own.map((m) => m.note && aiText(m.note, x)).filter((c): c is string => !!c);
      return own.some((m) => m.verdict || m.note) ? [{ trip: x.title, title: aiText(w.title, x), category: w.category, again: n("again"), ok: n("ok"), never: n("never"), ...(comments.length ? { comments } : {}) }] : [];
    })).slice(0, 60);
    return { items: items.map(({ trip: _t, ...m }) => m), from: [...new Set(items.map((m) => m.trip))] }; // from: the trips used, shown to the people (AI-91)
  }
  /** Runs one feature for a person and stores the result as proposals: one per suggestion for a helper (AI-01, AI-65, AI-70). */
  async function runFeature(t: Trip, name: string, f: AiFeature, who: string, actor: string) {
    const s = await store.loadSettings(), now = clock(), at = now.toISOString(), month = at.slice(0, 7);
    const h = f.helper, fingerprint = h ? await sha256(h.fingerprint(t)) : undefined;
    const cap = await capReached(s, await store.aiUses(month), who);
    if (cap) {
      if (h) await store.saveAiHelper(t.id, name, { at, result: "cap" });
      return { error: "cap" as const, scope: cap };
    }
    const own = h ? (await store.proposals(t.id)).filter((p) => p.source?.kind === "ai" && p.source.feature === name && p.status !== "approved") : [];
    const avoid = h ? [...h.known(t), ...own.flatMap((p) => p.ops.map(h.textOf))] : [];
    let r: AiResult;
    const mem = f.memories ? await earlierMemories(t) : undefined, memoriesFrom = mem?.items.length ? mem.from : undefined; // AI-14, AI-91
    try { r = await runAi(opts.ai!.call, f, t, avoid, at.slice(0, 10), mem?.items); } catch (e) {
      console.error(`AI ${name} on ${t.id} failed:`, e instanceof Error ? e.message : e); // shows in the Worker's logs
      r = { error: "failed", cost: NO_COST };
    }
    const ops = "error" in r ? [] : r.ops;
    let groups: Op[][] = ops.length ? [ops] : [];
    if (h) { // AI-70: nothing the trip has or the travelers rejected, each suggestion with ids of its own; AI-77: a wish and its activity together
      const taken = new Set([...allIds(t), ...own.flatMap((p) => p.ops.map((o) => String((o.value as { id?: unknown })?.id)))]);
      const names = (g: Op[]) => (h.names?.(g) ?? [h.textOf(g[0]!)]).filter(Boolean), same = (g: Op[], xs: string[]) => names(g).some((n) => xs.some((x) => sameSuggestion(x, n)));
      groups = (h.group ?? ((xs: Op[]) => xs.map((o) => [o])))(ops.map(h.finish), t)
        .filter((g, i, all) => !same(g, avoid) && all.findIndex((y) => same(g, names(y))) === i) // AI-95: also its place, in other words
        .map((g) => {
          const ids = new Map<string, string>();
          const own = (o: Op) => !!o.value && typeof o.value === "object" && "id" in o.value; // not a set title (AI-86)
          for (const o of g.filter(own)) { const v = o.value as { id: string }; let id = v.id; for (let n = 2; taken.has(id); n++) id = `${v.id}-${n}`; taken.add(id); ids.set(v.id, id); }
          return g.map((o) => { if (!own(o)) return o; const v = o.value as { id: string; dreamId?: string; placeIds?: string[] }; // the links inside a suggestion follow its new ids (AI-77, AI-81)
            return { ...o, value: { ...v, id: ids.get(v.id)!, ...(v.dreamId && ids.has(v.dreamId) ? { dreamId: ids.get(v.dreamId) } : {}),
              ...(Array.isArray(v.placeIds) ? { placeIds: v.placeIds.map((x) => ids.get(x) ?? x) } : {}) } }; });
        });
    }
    const result = "error" in r ? "error" : groups.length ? "proposal" : "nothing";
    await store.saveAiUse({ id: crypto.randomUUID(), at, month, tripId: t.id, who, feature: name, usd: r.cost.usd, result });
    if (h) await store.saveAiHelper(t.id, name, { ...("error" in r ? {} : { fingerprint }), at, result });
    if ("error" in r) return { error: r.error };
    const source = { kind: "ai" as const, feature: name, by: actor, at, ...(h ? { item: true } : {}), ...(memoriesFrom ? { memories: memoriesFrom } : {}) };
    const dayOf = (g: Op[]) => { const m = h && g.map((o) => /^days\/(\d+)\//.exec(o.path)).find(Boolean); return m ? t.days[Number(m[1])]?.id : undefined; }; // AI-77
    const proposals: Proposal[] = groups.map((x) => ({
      id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: x, reason: r.reason, status: "pending", at,
      source: { ...source, ...(dayOf(x) ? { day: dayOf(x) } : {}) } }));
    for (const p of proposals) await store.saveProposal(p);
    return { proposalIds: proposals.map((p) => p.id), reason: r.reason, ...(memoriesFrom ? { memoriesFrom } : {}) };
  }
  /** AI-69: after a change, the helpers that are on run again when the data they use changed; the owner pays (AI-03). */
  async function aiTick(id: string) {
    const t = opts.ai && await store.load(id);
    if (!t?.aiConsent) return;
    const s = await store.loadSettings();
    for (const [name, f] of Object.entries(features())) {
      if (!f.helper || !t.aiHelpers?.[name] || !mayRun(s, f, t)) continue;
      if ((await store.aiHelper(id, name))?.fingerprint === await sha256(f.helper.fingerprint(t))) continue;
      const owner = (await store.owners())[id] ?? firstSuper(await store.users())?.id ?? "admin";
      await runFeature(t, name, f, owner, sv.aiRun.auto);
    }
  }
  /** Every id in the trip, so a suggestion gets one of its own (DM-09). */
  const allIds = (t: Trip) => [...t.days, ...t.places, ...t.bookings, ...t.tasks, ...t.travelers, ...t.dreams, ...t.budget, ...t.expenses, ...t.payments, ...t.info,
    ...t.days.flatMap((d) => d.activities)].map((x) => x.id);
  /** A trip with nothing in it yet but its title, purpose and creator, which an AI draft may fill at once (AI-78, AI-94). */
  const isEmptyTrip = async (t: Trip) => {
    const users = await store.users(), ownerId = (await store.owners())[t.id] ?? firstSuper(users)?.id, owner = users.find((u) => u.id === ownerId);
    const creator = (await people(t.id)).find((l) => owner && l.account === owner.email)?.travelerId;
    return t.travelers.every((x) => x.id === creator && !x.packing.length) && [t.days, t.stops, t.bookings, t.tasks, t.dreams, t.expenses, t.places].every((x) => !x.length);
  };
  /** Who may start AI on a trip: those who plan it, with AI allowed for their account (AI-65, US-16). */
  const mayStart = (c: Context<Env>) => { const u = c.get("user"); return manager(c) && (!u || u.superuser || u.ai); };
  // AI-68, AI-72: the trip's helpers: whether each can run and is on, its latest run and about how many runs are left.
  app.get("/api/trips/:id/ai", async (c) => {
    if (!mayStart(c)) return c.json({ error: "forbidden" }, 403);
    const t = await load(c.req.param("id")), s = await store.loadSettings(), all = await store.aiUses();
    const uses = all.filter((x) => x.month === clock().toISOString().slice(0, 7)), who = c.get("user")?.id ?? whoOf(c);
    const helpers: Record<string, unknown> = {};
    for (const [name, f] of Object.entries(features())) {
      if (!f.helper) continue;
      const st = await store.aiHelper(t.id, name);
      helpers[name] = { available: !!opts.ai && offered(s, f), on: !!t.aiHelpers?.[name], ...(st ? { at: st.at, result: st.result } : {}), remaining: runsLeft(s, uses, all, who, name) };
    }
    return c.json({ enabled: !!opts.ai && s.ai.enabled, consent: !!t.aiConsent, helpers }); // AI-74: enabled, AI for the instance
  });
  // AI-65: one AI feature on the trip, now; for a helper the "Kör nu" button (AI-68).
  app.post("/api/trips/:id/ai/:feature", async (c) => {
    const name = c.req.param("feature"), f = opts.ai && featureOf(name);
    if (!f) return c.json({ error: "not found" }, 404);
    if (!mayStart(c)) return c.json({ error: "forbidden" }, 403);
    const t = await load(c.req.param("id"));
    if (!mayRun(await store.loadSettings(), f, t)) return c.json({ error: "off" }, 409);
    if (!t.aiConsent) return c.json({ error: "consent" }, 409); // AI-64
    const { apply: wantsApply } = await c.req.json<{ apply?: unknown }>().catch(() => ({ apply: undefined }));
    // AI-80: the helpers' first run right after "Skapa med AI" is applied at once, since that press was the approval
    const applyFirst = wantsApply === true && !!f.helper && !(await store.aiHelper(t.id, name))
      && (await store.proposals(t.id)).some((p) => p.source?.kind === "ai" && p.source.feature === "draft" && p.status === "approved");
    const r = await runFeature(t, name, f, c.get("user")?.id ?? whoOf(c), actorName(c, t));
    if ("error" in r) return r.error === "cap" ? c.json({ error: "cap", scope: r.scope }, 429) : c.json({ error: r.error }, 502);
    if (applyFirst && !("error" in r)) {
      const applied = { activities: 0, tasks: 0, bookings: 0, wishes: 0, info: 0, packing: 0 }, actor = `ai (${actorName(c, t)})`;
      for (const p of (await store.proposals(t.id)).filter((x) => r.proposalIds.includes(x.id))) { // one at a time, so one that fails stays a proposal
        const ops = onItsDay(await load(t.id), p);
        if (!ops) continue;
        const done = await apply(await load(t.id), ops, actor, p.reason || `ai ${name}`);
        if (!("revision" in done)) continue;
        p.status = "approved"; await store.saveProposal(p);
        for (const o of ops) {
          if (/^days\/\d+\/activities\/(\d+|-)$/.test(o.path)) applied.activities++;
          else if (o.path === "tasks/-") applied.tasks++;
          else if (o.path === "bookings/-") applied.bookings++;
          else if (o.path === "dreams/-") applied.wishes++;
          else if (o.path === "info/-") applied.info++; // AI-87
          else if (/^(travelers\/\d+\/)?packing\/-$/.test(o.path)) applied.packing++; // AI-89
        }
      }
      const { info, packing, ...rest } = applied;
      return c.json({ applied: { ...rest, ...(info ? { info } : {}), ...(packing ? { packing } : {}) }, proposalIds: r.proposalIds, reason: r.reason, ...("memoriesFrom" in r ? { memoriesFrom: r.memoriesFrom } : {}) });
    }
    const [pid] = r.proposalIds;
    if (f.applyToNew && pid && await isEmptyTrip(t)) { // AI-78: pressing "Skapa med AI" approved the draft of the new trip
      const p = (await store.proposals(t.id)).find((x) => x.id === pid)!;
      const done = await apply(t, p.ops, `ai (${actorName(c, t)})`, p.reason || "ai draft");
      if ("revision" in done) {
        p.status = "approved";
        await store.saveProposal(p);
        return c.json({ applied: true, revision: done.revision, proposalId: pid, proposalIds: r.proposalIds, reason: r.reason, ...("memoriesFrom" in r ? { memoriesFrom: r.memoriesFrom } : {}) });
      }
    }
    return c.json({ proposalId: r.proposalIds[0] ?? null, proposalIds: r.proposalIds, reason: r.reason, ...("memoriesFrom" in r ? { memoriesFrom: r.memoriesFrom } : {}) }, r.proposalIds.length ? 202 : 200);
  });

  /** Runs a reading with AI for a person and counts its cost (AI-03); undefined with the reason it did not run. */
  async function aiReading<T>(c: Context<Env>, t: Trip, area: "mail" | "receipts", feature: string, run: (call: AiCall) => Promise<ReadOut<T>>) {
    const s = await store.loadSettings();
    if (!opts.ai || !aiOnForTrip(s, area, true, t)) return { status: 409 as const, error: "off" };
    if (!t.aiConsent) return { status: 409 as const, error: "consent" }; // AI-64
    const now = clock(), at = now.toISOString(), month = at.slice(0, 7), who = c.get("user")?.id ?? whoOf(c);
    const cap = await capReached(s, await store.aiUses(month), who);
    if (cap) return { status: 429 as const, error: "cap", scope: cap };
    const r = await run(opts.ai.call);
    await store.saveAiUse({ id: crypto.randomUUID(), at, month, tripId: t.id, who, feature, usd: r.cost.usd, result: "error" in r ? "error" : "proposal" });
    return "error" in r ? { status: 502 as const, error: r.error } : { reading: r.reading };
  }
  // AI-60: "Läs med AI" on a mail proposal: what the rules missed, from the scrubbed mail; the reference stays the rules'.
  app.post("/api/trips/:id/mailread/:pid", async (c) => {
    if (!mayStart(c)) return c.json({ error: "forbidden" }, 403);
    const t = await load(c.req.param("id")), p = (await store.proposals(t.id)).find((x) => x.id === c.req.param("pid") && x.status === "pending" && x.source?.kind === "mail");
    if (!p?.mailText) return c.json({ error: "not found" }, 404);
    const rules = p.booking ?? {};
    const r = await aiReading(c, t, "mail", "mailread", (call) => readBookingAi(call, mailForAi(p.mailText!, t, rules.reference),
      { dates: t.days.map((d) => d.date), currency: t.currency, today: clock().toISOString().slice(0, 10) }));
    if (!("reading" in r)) return c.json({ error: r.error, ...("scope" in r ? { scope: r.scope } : {}) }, r.status);
    const { files: _f, ...had } = rules as BookingReading & { files?: unknown };
    const ai = (Object.keys(r.reading ?? {}) as (keyof BookingReading)[]).filter((k) => had[k] === undefined || had[k] === "");
    return c.json({ reading: { ...r.reading, ...Object.fromEntries(Object.entries(had).filter(([, v]) => v !== undefined && v !== "")), ai } });
  });
  // AI-42: "Läs kvitto": a photo of a receipt becomes values for the expense form, which the person checks and saves.
  app.post("/api/trips/:id/receipt", async (c) => {
    const u = c.get("user"), role = c.get("role");
    if (role === "link" || role === "read" || role === "propose" || !(u ? u.superuser || u.ai : manager(c))) return c.json({ error: "forbidden" }, 403);
    const t = await load(c.req.param("id")), bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > MAX_FILE) return c.json({ error: "too large" }, 413);
    const type = imageType(bytes);
    if (!type) return c.json({ error: "a JPEG, PNG or WebP photo" }, 400);
    const r = await aiReading(c, t, "receipts", "receipt", (call) => readReceiptAi(call, { type, data: toBase64(bytes) },
      { currency: t.currency, dates: t.days.map((d) => d.date), categories: sv.budgetCategories, today: clock().toISOString().slice(0, 10) }));
    return "reading" in r ? c.json(r) : c.json({ error: r.error, ...("scope" in r ? { scope: r.scope } : {}) }, r.status);
  });

  // US-29: per trip, who is active, Uppleva during the trip and Minnas, for the superuser.
  app.get("/api/usage", async (c) => {
    if (c.get("role") !== "admin" || scoped(c)) return c.json({ error: "forbidden" }, 403);
    const [trips, users, owners, seen, log, ais] = await Promise.all([store.list(), store.users(), store.owners(), store.usage(), store.log(), store.aiUses()]);
    const name = (id: string) => users.find((u) => u.id === id)?.name ?? id;
    const first = firstSuper(users)?.id;
    return c.json(trips.map((t) => {
      const dates = t.days.map((d) => d.date).sort(), from = dates[0], to = dates.at(-1);
      const mine = seen.filter((x) => x.tripId === t.id), changes = log.filter((e) => e.tripId === t.id && e.reason !== "create");
      const names = [...new Set([...mine.map((x) => name(x.who)), ...changes.map((e) => e.actor).filter((a) => a !== "user" && a !== "llm" && a !== "ai" && a !== "mejl")])];
      const aiOf = ais.filter((x) => x.tripId === t.id), whoName = (id: string) => users.find((u) => u.id === id)?.name ?? t.travelers.find((x) => x.id === id)?.name ?? id;
      const ai = [...new Set(aiOf.map((x) => x.who))].map((w) => { const own = aiOf.filter((x) => x.who === w); return { name: whoName(w), calls: own.length, usd: own.reduce((n, x) => n + x.usd, 0) }; }); // AI-03
      const people = names.map((n) => {
        const own = mine.filter((x) => name(x.who) === n), days = (tab: Usage["tab"]) => own.filter((x) => x.tab === tab).length;
        return { name: n, days: { dr: days("dr"), nala: days("nala"), up: days("up"), mi: days("mi") },
          upDuring: own.filter((x) => x.tab === "up" && from && to && x.day >= from && x.day <= to).length, changes: changes.filter((e) => e.actor === n).length };
      });
      return { tripId: t.id, title: t.title, owner: name(owners[t.id] ?? first ?? ""), ...(from ? { from, to } : {}), memories: t.memories.length, people, ai };
    }));
  });
  /** BK-32: the mail is shown to the AI service only when the trip has accepted AI, the area is on and the cap not reached. */
  async function askKind(...[t, text]: Parameters<AskKind>): ReturnType<AskKind> {
    const s = await store.loadSettings();
    if (!opts.ai || !aiOnForTrip(s, "mail", true, t) || !t.aiConsent) return undefined;
    const at = clock().toISOString(), month = at.slice(0, 7);
    if (await capReached(s, await store.aiUses(month), "mejl")) return undefined;
    const r = await readMailKindAi(opts.ai.call, mailForAi(text, t));
    await store.saveAiUse({ id: crypto.randomUUID(), at, month, tripId: t.id, who: "mejl", feature: "mailsort", usd: r.cost.usd, result: "error" in r ? "error" : "proposal" });
    return "reading" in r ? r.reading.kind : undefined;
  }
  /** BK-15, BK-32: a mail from the Worker's email handler, sorted with the AI service where the rules cannot. */
  const receive = (raw: Uint8Array | ArrayBuffer, to: string) => receiveMail(store, raw, to, fetch, askKind);
  return { aiTick, receive, askKind };
}
