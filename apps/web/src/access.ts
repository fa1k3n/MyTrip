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
