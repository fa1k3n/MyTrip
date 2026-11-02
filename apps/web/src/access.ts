// Share links, the credentials sent to the API and what each role may do (AU-01, AU-02, AU-08, AU-20). Pure, so it runs under node --test.
import { accessFor, ALL_ACCESS, resolve, type AccessConfig, type Rules } from "@trip/schema/src/rules.ts";
import { sv } from "./sv.ts";

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

/** owner: a user on a trip they own; account: a user on the start page (US-14). */
export type Role = "admin" | "read" | "propose" | "link" | "traveler" | "planner" | "owner" | "account";
export type Perms = Rules & { scoped: boolean; superuser: boolean; manager: boolean; settings: boolean };
/** What a role may see and do in the app on a trip. Links follow the trip's permissions; the superuser may do everything (AU-20, AU-21).
 * scoped: one trip, no start page; manager: everything on the trip, as the superuser or the owner (US-14); settings: the trip's
 * settings and links (AU-22). A user tied to a traveler has that traveler's permission, without the scope of a link (US-22). */
export function permsFor(role: Role, t: { access?: AccessConfig }, account = false): Perms {
  if (role !== "link" && role !== "traveler" && role !== "planner")
    return { ...resolve(ALL_ACCESS), scoped: false, superuser: role === "admin", manager: role === "admin" || role === "owner", settings: true };
  return { ...accessFor(t, role === "link" ? "follower" : role), scoped: !account, superuser: false, manager: false, settings: role === "planner" };
}

/** What /api/me answers: a token, a link, or a user with their roles per trip (US-22). */
export type Membership = { role: "admin" | "owner" | "traveler" | "planner"; roles: ("owner" | "traveler" | "planner")[]; travelerId?: string; owner?: string };
export type Me = { role: "admin" | "read" | "propose" } | { role: "link"; tripId: string } | { role: "traveler" | "planner"; tripId: string; travelerId: string }
  | { role: "admin" | "account"; user: { id: string; name: string; superuser: boolean }; trips: Record<string, Membership>; consent?: boolean };
/** US-26: an account that has not accepted the beta notice sees only the notice. */
export const needsConsent = (me: Me) => "user" in me && !me.consent;
/** US-28: one page open per trip, page and day is enough; the key the device remembers it under. */
export const seenKey = (tripId: string, tab: string) => `mytrip.seen.${tripId}.${tab}`;
/** The role on one trip, and the traveler a personal link or a tied user acts as (US-14, US-22). Without a trip: the start page. */
export function roleIn(me: Me, tripId: string | undefined): { role: Role; travelerId?: string } {
  if ("user" in me) {
    const m = tripId ? me.trips[tripId] : undefined;
    if (!m) return { role: me.role };
    return m.role === "traveler" || m.role === "planner" ? { role: m.role, travelerId: m.travelerId! } : { role: m.role };
  }
  return "travelerId" in me ? { role: me.role, travelerId: me.travelerId } : { role: me.role };
}
/** Who is logged in, in the chip on Drömmar: the user's name, or the admin password's holder (US-25). */
export const whoChip = (me: Me) => ("user" in me ? me.user.name : sv.admin);
/** UI-20: a visitor without a session and without a link lands on Om Basläger. Any fragment keeps the login page: #login (the
 * landing page's login icon), a password link (#u=), Google's answer (#login=…), #admin; so does a link that no longer works. */
export const landsOnAbout = (hash: string, hadLink: boolean, admin: boolean) => !hadLink && !admin && (hash === "" || hash === "#");
export const ABOUT_PAGE = "/om.html";
/** The user's roles on a trip, as icons on its card on Drömmar (US-23). */
export const roleIcons = (me: Me, tripId: string) => ("user" in me ? me.trips[tripId]?.roles ?? [] : []);
/** The password link of an account (US-04): the secret after #, as for the share links. */
export const setupUrl = (origin: string, user: string, secret: string) => `${origin}/#u=${user}.${secret}`;
export function parseSetupHash(hash: string): { user: string; secret: string } | null {
  const m = /^#u=([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? { user: m[1]!, secret: m[2]! } : null;
}
/** True when the role may change some component, so Nåla offers edit mode. */
/** Whether the role edits the trip; writing one's own memories is not editing it (MI-21). */
export const anyWrite = (p: Perms) => Object.values(p.view).some((page) => Object.entries(page).some(([k, l]) => l === "write" && k !== "memories"));

/** The pages of the app on the home screen, in the order of its tab bar: the trip itself (PW-24). */
const INSTALLED = ["up", "dr", "mi"] as const;
/** The installed app shows Uppleva, Önska and Minnas of what the role may see, without the settings; a role with none of them keeps
 * what it has (PW-24). */
export function forInstalled(p: Perms): Perms {
  const pages = INSTALLED.filter((x) => p.pages.includes(x));
  return pages.length ? { ...p, pages, settings: false } : p;
}
/** A role that may see Nåla gets the link to the full app in Safari (PW-24). */
export const needsFullApp = (p: Perms) => p.pages.some((x) => !(INSTALLED as readonly string[]).includes(x));
/** The installed app opens a trip on Uppleva, else on the role's first page (PW-25). */
export const installedTab = <T extends string>(pages: T[]): T | undefined => (pages.includes("up" as T) ? ("up" as T) : pages[0]);
/** Back from the background after an hour or more, the installed app starts over on Uppleva and today (PW-25). */
export const freshAgain = (hiddenAt: number | undefined, now: number) => hiddenAt !== undefined && now - hiddenAt >= 60 * 60_000;
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

/** The trip of a stored link. */
export const tripOfLink = (key: string) => key.split(".")[1];
/** A link without its secret: a renewed link for the same trip and traveler has the same one. */
const linkOwner = (key: string) => key.split(".").slice(0, -1).join(".");
/** The phone keeps every link opened on it; a renewed one takes the old one's place (PW-16). */
export const addLink = (keys: string[], key: string) =>
  keys.some((k) => linkOwner(k) === linkOwner(key)) ? keys.map((k) => (linkOwner(k) === linkOwner(key) ? key : k)) : [...keys, key];
export const removeLink = (keys: string[], key: string) => keys.filter((k) => k !== key); // PW-17

const LINKS = "mytrip.links";
/** Every link in one cookie, which Safari copies to an app added to the home screen (PW-02, PW-16). The server never reads it. */
export const linksCookie = (keys: string[]) =>
  `${LINKS}=${keys.join("~")}; Path=/; Secure; SameSite=Strict; Max-Age=${keys.length ? 400 * 24 * 3600 : 0}`;
export function cookieLinks(cookie: string): string[] {
  const v = cookie.split(/;\s*/).find((c) => c.startsWith(`${LINKS}=`))?.slice(LINKS.length + 1) ?? "";
  const keys = v.split("~").filter((k) => parseLinkHash(linkHash(k)));
  const single = cookieLink(cookie); // the one link of PW-02, before PW-16
  return single ? addLink(keys, single) : keys;
}
/** The hint on adding the app to the home screen: in Safari on an iPhone, not installed, until closed (PW-12). */
export const showInstallHint = (ua: string, installed: boolean, closed: boolean) =>
  !installed && !closed && /iPhone/.test(ua) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
/** The link the phone keeps for a trip, so a notice opens that trip (NT-04). */
export const linkForTrip = (keys: string[], tripId: string) => keys.find((k) => tripOfLink(k) === tripId) ?? null;

/** The permission card's columns: a Planerare always has everything, so only Resenär and Följare are chosen (AU-37). */
export const PERM_ROLES = ["traveler", "follower"] as const;
/** The icon of each level in the permission card; a tab row is Synlig or Dold (AU-37). */
export const LEVEL_ICON = { hidden: "eyeoff", read: "eye", shown: "eye", check: "check", add: "plus", write: "edit" } as const;
/** The level after `cur` among those a cell allows, round to the first again (AU-37). */
export const nextLevel = (levels: readonly string[], cur: string) => levels[(levels.indexOf(cur) + 1) % levels.length]!;
