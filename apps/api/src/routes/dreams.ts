// A wish's image: Commons search, own photo, the cache of ended trips (DB-07, DB-08, DB-11, DB-12).
import { Hono, type Context } from "hono";
import { cacheKey, commonsImage, fetchImage, IMAGE_MAX, imageType, type CommonsImage } from "../wishimage.ts";
import { Trip, accessFor } from "@trip/schema";
import { sv } from "../../../web/src/sv.ts";
import { COMMONS_FILES, type CacheEntry, type Env, accessRole, newFileId } from "./shared.ts";
import type { Ctx } from "./ctx.ts";

export function dreamRoutes(app: Hono<Env>, k: Ctx) {
  const { store, opts, need, full, apply, load } = k;
  /** Whether the caller may change wishes: the superuser, or a link whose role has Ändra on them (DB-10). */
  const changesWishes = (c: Context<Env>, t: Trip) => {
    const ar = accessRole(c.get("role"));
    return ar ? accessFor(t, ar).parts.dreams === "write" : full(c);
  };
  const now = () => opts.now?.() ?? new Date();
  const actorOf = (c: Context<Env>, t: Trip) => (c.get("travelerId") ? t.travelers.find((x) => x.id === c.get("travelerId"))?.name ?? "link" : c.get("user")?.name ?? "user");
  /** A Commons image for a title: from the cache, else looked up, copied and cached; "nothing found" is kept 30 days (DB-06, DB-11). */
  async function lookup(title: string): Promise<{ found?: NonNullable<CacheEntry["found"]>; failed?: true }> {
    const key = cacheKey(title);
    if (!key) return {};
    const hit = (await store.imageCache()).find((e) => e.key === key);
    if (hit?.found && await store.file(hit.found.file)) return { found: hit.found };
    if (hit && !hit.found && now().getTime() - Date.parse(hit.at) < 30 * 86_400_000) return {};
    let img: CommonsImage | undefined, got: Awaited<ReturnType<typeof fetchImage>>;
    try {
      img = await commonsImage(title, opts.fetch);
      got = img && await fetchImage(img.image, opts.fetch);
    } catch { return { failed: true }; } // a busy service: asked again next time (DB-07)
    if (!img || !got) { await store.saveImageCache({ key, at: now().toISOString() }); return {}; }
    const file = newFileId();
    await store.saveFile({ id: file, tripId: COMMONS_FILES, type: got.type }, got.bytes);
    const { image: _from, ...credit } = img;
    const found = { file, ...credit, size: got.bytes.length };
    await store.saveImageCache({ key, at: now().toISOString(), found });
    return { found };
  }
  const commonsValue = ({ size: _size, ...f }: NonNullable<CacheEntry["found"]>) => ({ ...f, kind: "commons" as const });
  /** Keeps an image with the wish and clears "tried" (DB-07, DB-08). */
  const setImage = (c: Context<Env>, t: Trip, i: number, image: NonNullable<Trip["dreams"][number]["image"]>, reason: string) =>
    apply(t, [{ op: "set", path: `dreams/${i}/image`, value: image }, ...(t.dreams[i]!.imageTried ? [{ op: "remove" as const, path: `dreams/${i}/imageTried` }] : [])], actorOf(c, t), reason);
  const answer = (c: Context<Env>, r: Awaited<ReturnType<typeof apply>>, extra: object = {}) =>
    "revision" in r ? c.json({ ...r, ...extra }) : "conflict" in r ? c.json({ error: "conflict" }, 409) : c.json({ ok: false, problems: r.problems }, 422);
  /** The trip and the wish's index, or the answer for a missing wish or a caller without Ändra on wishes (DB-10). */
  const wishOf = async (c: Context<Env>) => {
    const t = await load(c.req.param("id")!), i = t.dreams.findIndex((x) => x.id === c.req.param("wid"));
    if (i < 0) return c.json({ error: "not found" }, 404);
    if (!changesWishes(c, t)) return c.json({ error: "forbidden" }, 403);
    return { t, i };
  };
  // DB-07: searching with own words; the preview comes from our own server, and nothing changes before the user chooses.
  app.post("/api/trips/:id/dreams/:wid/image/find", async (c) => {
    const w = await wishOf(c);
    if (w instanceof Response) return w;
    const b = await c.req.json<{ query?: unknown }>().catch(() => ({} as { query?: unknown }));
    const r = await lookup(typeof b.query === "string" && b.query.trim() ? b.query : w.t.dreams[w.i]!.title);
    if (r.failed) return c.json({ failed: true });
    const file = r.found && await store.file(r.found.file);
    if (!r.found || !file) return c.json({ found: null });
    return c.json({ found: commonsValue(r.found), preview: `data:${file.type};base64,${btoa(String.fromCharCode(...file.bytes))}` });
  });
  // DB-07: the user chose the image found for these words.
  app.post("/api/trips/:id/dreams/:wid/image", async (c) => {
    const w = await wishOf(c);
    if (w instanceof Response) return w;
    const b = await c.req.json<{ query?: unknown }>().catch(() => ({} as { query?: unknown }));
    const r = await lookup(typeof b.query === "string" && b.query.trim() ? b.query : w.t.dreams[w.i]!.title);
    if (r.failed) return c.json({ error: "unavailable" }, 503);
    if (!r.found) return c.json({ error: "not found" }, 404);
    return answer(c, await setImage(c, w.t, w.i, commonsValue(r.found), "wish image"));
  });
  // DB-07: the first image found, once, for a wish without one; nothing found marks it as tried, a busy service does not.
  app.post("/api/trips/:id/dreams/:wid/image/auto", async (c) => {
    const w = await wishOf(c);
    if (w instanceof Response) return w;
    const wish = w.t.dreams[w.i]!;
    if (wish.image || wish.imageTried) return c.json({ skipped: true });
    const r = await lookup(wish.title);
    if (r.failed) return c.json({ failed: true });
    if (r.found) return answer(c, await setImage(c, w.t, w.i, commonsValue(r.found), "wish image (automatic)"), { image: commonsValue(r.found) });
    return answer(c, await apply(w.t, [{ op: "set", path: `dreams/${w.i}/imageTried`, value: true }], actorOf(c, w.t), "no wish image found"));
  });
  // DB-12: an own photo, scaled down on the phone; checked as in DB-08 and stored with the trip.
  app.post("/api/trips/:id/dreams/:wid/image/upload", async (c) => {
    const w = await wishOf(c);
    if (w instanceof Response) return w;
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > IMAGE_MAX) return c.json({ error: "too large" }, 413);
    const type = imageType(bytes);
    if (!type) return c.json({ error: "JPEG, PNG or WebP only" }, 415);
    const file = newFileId();
    await store.saveFile({ id: file, tripId: w.t.id, type }, bytes);
    const r = await setImage(c, w.t, w.i, { file, kind: "own" }, "own wish photo");
    if (!("revision" in r)) await store.removeFiles([file]);
    return answer(c, r);
  });
  /** The Commons images of ended trips and the cached files no trip would use without them; with `clear`, removes them (DB-13). */
  async function endedCache(clear: boolean) {
    const today = (tz: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now());
    const trips = await store.list();
    const ended = trips.filter((t) => t.days.length > 0 && t.days.every((d) => d.date < today(t.timezone)));
    const commons = (t: Trip) => t.dreams.flatMap((w, i) => (w.image?.kind === "commons" ? [i] : []));
    const images = ended.reduce((a, t) => a + commons(t).length, 0);
    for (const t of clear ? ended : []) {
      const idx = commons(t);
      if (idx.length) await apply(t, idx.flatMap((i) => [{ op: "remove" as const, path: `dreams/${i}/image` }, { op: "set" as const, path: `dreams/${i}/imageTried`, value: true }]), "user", "empty image cache");
    }
    const after: Trip[] = clear ? await store.list() : trips.map((t) => (ended.includes(t) ? { ...t, dreams: t.dreams.map((w) => (w.image?.kind === "commons" ? { ...w, image: undefined } : w)) } : t));
    const used = new Set(after.flatMap((t) => t.dreams.flatMap((w) => (w.image?.kind === "commons" ? [w.image.file] : []))));
    const unused = (await store.imageCache()).filter((e) => e.found && !used.has(e.found.file));
    if (clear && unused.length) { await store.removeFiles(unused.map((e) => e.found!.file)); await store.removeImageCache(unused.map((e) => e.key)); }
    return { trips: ended.length, images, files: unused.length, bytes: unused.reduce((a, e) => a + e.found!.size, 0) };
  }
  app.get("/api/image-cache/ended", async (c) => (need(c, "admin") ? c.json(await endedCache(false)) : c.json({ error: "forbidden" }, 403)));
  app.post("/api/image-cache/ended", async (c) => (need(c, "admin") ? c.json(await endedCache(true)) : c.json({ error: "forbidden" }, 403)));
}
