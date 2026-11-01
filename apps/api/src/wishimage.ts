// Images for wishes without AI, only from Wikimedia Commons with a free licence (DB-06), copied and kept in a cache that all
// trips share (DB-08, DB-11). Only Wikimedia's own https hosts are fetched, with a size limit and a timeout.

type Fetch = typeof fetch;
export type CommonsImage = { image: string; page: string; author?: string; licence: string; licenceUrl?: string };

export const IMAGE_MAX = 300 * 1024; // DB-08
const TIMEOUT_MS = 8000, THUMB_PX = 500; // Wikimedia serves only its standard thumbnail widths: 500, not 640
const UA = "MyTrip/0.1 (https://github.com/fa1k3n/MyTrip; wish images)"; // Wikimedia asks every client to name itself with a contact
const HOSTS = /^(sv|en|de)\.wikipedia\.org$|^(commons|upload|thumb)\.wikimedia\.org$/;

/** Fetches a Wikimedia address, following redirects only within Wikimedia. A busy service is an error, not "nothing" (DB-07). */
async function get(url: string, f: Fetch, accept: string): Promise<Response | undefined> {
  let u: URL | undefined = new URL(url);
  for (let hop = 0; u && hop < 4; hop++) {
    if (u.protocol !== "https:" || !HOSTS.test(u.hostname)) return undefined;
    const r: Response = await f(u.href, { redirect: "manual", headers: { accept, "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.status >= 300 && r.status < 400) { const next: string | null = r.headers.get("location"); u = next ? new URL(next, u) : undefined; continue; }
    if (r.status === 429 || r.status >= 500) throw new Error(`unavailable ${r.status}`);
    return r.ok ? r : undefined;
  }
  return undefined;
}
const json = async <T,>(url: string, f: Fetch) => { const r = await get(url, f, "application/json"); return r ? (await r.json()) as T : undefined; };
const entities = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const plain = (html: string) => entities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

/** CC0, public domain, CC BY and CC BY-SA in any version; nothing non-commercial, no-derivatives or unknown (DB-06). */
export function licenceOk(name: string) {
  const n = name.trim().toLowerCase().replace(/[-_]/g, " ");
  if (/\b(nc|nd)\b/.test(n)) return false;
  return /^cc0\b/.test(n) || /^(public domain|pd\b)/.test(n) || /^cc by( sa)?( \d(\.\d)?)?\b/.test(n);
}

/** A title as the cache knows it: lower case, single spaces (DB-11). */
export const cacheKey = (title: string) => title.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

/** The image of the Wikipedia article found by the title, in Swedish, English, then German, when it is a Commons file with an
 * allowed licence and no restrictions; as a thumbnail 500 px wide, under the 640 px limit (DB-06). */
export async function commonsImage(title: string, f: Fetch = fetch): Promise<CommonsImage | undefined> {
  for (const lang of ["sv", "en", "de"]) {
    const hit = (await json<{ pages?: { key: string; thumbnail?: unknown }[] }>(`https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(title)}&limit=1`, f))?.pages?.[0];
    if (!hit?.thumbnail) continue; // no article, or one without an image: no further calls (Wikimedia limits the rate)
    type Summary = { thumbnail?: { source: string }; originalimage?: { source: string; width: number } };
    const s = await json<Summary>(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.key)}`, f);
    if (!s?.thumbnail || !s.originalimage) continue;
    const path = new URL(s.originalimage.source).pathname.split("/").map(decodeURIComponent);
    if (path[1] !== "wikipedia" || path[2] !== "commons") continue; // a local upload, possibly fair use: never
    const name = path[path.length - 1]!;
    type Info = { query?: { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }> } };
    const info = await json<Info>(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(`File:${name}`)}`, f);
    const meta = Object.values(info?.query?.pages ?? {})[0]?.imageinfo?.[0]?.extmetadata ?? {};
    const licence = plain(meta.LicenseShortName?.value ?? "");
    if (!licenceOk(licence) || plain(meta.Restrictions?.value ?? "")) continue;
    const image = s.originalimage.width > THUMB_PX ? s.thumbnail.source.replace(/\/\d+px-/, `/${THUMB_PX}px-`).replace(/\?.*$/, "") : s.originalimage.source;
    const author = plain(meta.Artist?.value ?? "").replace(/\s*\((talk|diskussion)[^)]*\)/gi, "").slice(0, 200), licenceUrl = meta.LicenseUrl?.value; // no "(talk · contribs)"
    return { image, page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name.replace(/ /g, "_"))}`, licence,
      ...(author ? { author } : {}), ...(licenceUrl && /^https?:\/\//.test(licenceUrl) ? { licenceUrl } : {}) };
  }
  return undefined;
}

/** At most `max` bytes of a body; null when it is longer. */
async function bytesOf(r: Response, max: number): Promise<Uint8Array | null> {
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.length;
    if (n > max) { await reader.cancel(); return null; }
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export type ImageType = "image/jpeg" | "image/png" | "image/webp";
/** The type of an image by its first bytes, or undefined (DB-08). */
export function imageType(b: Uint8Array): ImageType | undefined {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return undefined;
}

/** A Commons image's bytes, checked as in DB-08; undefined when it cannot be stored. */
export async function fetchImage(url: string, f: Fetch = fetch): Promise<{ bytes: Uint8Array; type: ImageType } | undefined> {
  const r = await get(url, f, "image/*");
  const bytes = r && await bytesOf(r, IMAGE_MAX);
  const type = bytes ? imageType(bytes) : undefined;
  return bytes && type ? { bytes, type } : undefined;
}
