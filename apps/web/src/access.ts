// Share links, the credentials sent to the API and what each role may do (AU-01, AU-02, AU-08, AU-20). Pure, so it runs under node --test.
import { accessFor, ALL_ACCESS, resolve, type AccessConfig, type Rules } from "@trip/schema/src/rules.ts";

export type LinkHash = { kind: "link"; key: string; tripId: string } | { kind: "admin" } | null;

/** The secret goes after #, so it is never sent in a request path or a Referer header (AU-01). */
export const shareUrl = (origin: string, tripId: string, secret: string) => `${origin}/#l=${tripId}.${secret}`;
/** A traveler's personal link (AU-11). */
export const personUrl = (origin: string, tripId: string, travelerId: string, secret: string) => `${origin}/#p=${tripId}.${travelerId}.${secret}`;

export function parseLinkHash(hash: string): LinkHash {
  if (hash === "#admin") return { kind: "admin" };
  const m = /^#l=([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(hash);
  if (m) return { kind: "link", key: `link.${m[1]}.${m[2]}`, tripId: m[1] };
  const p = /^#p=([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(hash);
  return p ? { kind: "link", key: `person.${p[1]}.${p[2]}.${p[3]}`, tripId: p[1] } : null;
}

/** A share link wins over the development token; with neither, the admin session cookie does the work. */
export const authHeader = (devToken: string, link: string | null) =>
  link ? `Bearer ${link}` : devToken ? `Bearer ${devToken}` : undefined;


/** The travelers who have no personal link yet; the settings create one for each (AU-11). */
export const missingLinks = (travelers: { id: string }[], links: { travelerId: string }[]) =>
  travelers.filter((x) => !links.some((l) => l.travelerId === x.id)).map((x) => x.id);

export type Role = "admin" | "read" | "propose" | "link" | "traveler" | "planner";
export type Perms = Rules & { scoped: boolean; superuser: boolean; settings: boolean };
/** What a role may see and do in the app on a trip. Links follow the trip's permissions; the superuser may do everything (AU-20, AU-21).
 * scoped: one trip, no start page; settings: the trip's settings and links (AU-22). */
export function permsFor(role: Role, t: { access?: AccessConfig }): Perms {
  if (role !== "link" && role !== "traveler" && role !== "planner")
    return { ...resolve(ALL_ACCESS), scoped: false, superuser: role === "admin", settings: true };
  return { ...accessFor(t, role === "link" ? "follower" : role), scoped: true, superuser: false, settings: role === "planner" };
}
/** True when the role may change some component, so Nåla offers edit mode. */
export const anyWrite = (p: Perms) => Object.values(p.view).some((page) => Object.values(page).some((l) => l === "write"));

/** The installed app on the home screen is for the trip itself and shows only Uppleva (PW-15). */
export const forInstalled = (p: Perms): Perms => (p.pages.includes("up") ? { ...p, pages: ["up"], settings: false } : p);
/** The fragment that a stored link came from, the inverse of parseLinkHash. */
export function linkHash(key: string | null): string {
  const [kind, ...rest] = key?.split(".") ?? [];
  return kind === "link" ? `#l=${rest.join(".")}` : kind === "person" ? `#p=${rest.join(".")}` : "";
}
/** The full app in Safari with the same link; iPhone opens x-safari- links in Safari, not in the installed app (PW-15). */
export const safariUrl = (origin: string, key: string | null) => `x-safari-${origin}/${linkHash(key)}`;

const COOKIE = "mytrip.link";
/** The link is also kept in a cookie, which Safari copies to an app added to the home screen (PW-02). The server never reads it. */
export const linkCookie = (key: string | null) =>
  `${COOKIE}=${key ?? ""}; Path=/; Secure; SameSite=Strict; Max-Age=${key ? 400 * 24 * 3600 : 0}`;
export function cookieLink(cookie: string): string | null {
  const v = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? "";
  return parseLinkHash(linkHash(v)) ? v : null;
}
/** The fragment of a link pasted into the installed app, when the cookie did not reach it (PW-02); #admin does not count. */
export function linkFromText(text: string): string | null {
  const hash = /#[lp]=[^\s]+/.exec(text)?.[0] ?? "";
  return parseLinkHash(hash)?.kind === "link" ? hash : null;
}
