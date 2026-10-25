import type { Op, Settings, Trip } from "@trip/schema";
import type { Traffic } from "./transport.ts";

import { authHeader, cookieLink, linkCookie, parseLinkHash } from "./access.ts";

// The development token is used only by the local dev server; a build never contains it (AU-08).
const TOKEN = import.meta.env.DEV ? (import.meta.env.VITE_TRIP_TOKEN ?? "") : "";
const LINK_KEY = "mytrip.link";
/** The cookie is the copy that reaches an app added to the home screen, whose storage is separate from Safari's (PW-02). */
const stored = () => { try { return localStorage.getItem(LINK_KEY) ?? cookieLink(document.cookie); } catch { return cookieLink(document.cookie); } };
const keep = (key: string | null) => { document.cookie = linkCookie(key); };
/** True in the app opened from the home screen (PW-15). */
export const installed = (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;

/** A share link in the address is kept on the device and removed from the address bar (AU-02). #admin forgets it (AU-23). */
const fromUrl = parseLinkHash(location.hash);
if (fromUrl?.kind === "link") {
  try { localStorage.setItem(LINK_KEY, fromUrl.key); } catch { /* private mode: the link works for this visit only */ }
  keep(fromUrl.key);
  history.replaceState(null, "", location.pathname + location.search);
}
if (fromUrl?.kind === "admin") { try { localStorage.removeItem(LINK_KEY); } catch { /* nothing stored */ } keep(null); }
// A link or #admin typed into a tab that is already open only changes the fragment, so load the page again to use it (AU-23).
addEventListener("hashchange", () => { if (parseLinkHash(location.hash)) location.reload(); });
let link = fromUrl?.kind === "link" ? fromUrl.key : stored();
/** True when the page was opened with #admin, to reach the admin login from a device that holds a link. */
export const askedForAdmin = fromUrl?.kind === "admin";
export const forgetLink = () => { link = null; keep(null); try { localStorage.removeItem(LINK_KEY); } catch { /* nothing stored */ } };
/** The link this device uses, to open the same one in Safari (PW-15). */
export const linkKey = () => (askedForAdmin ? null : link);

const headers = () => {
  const a = askedForAdmin ? authHeader(TOKEN, null) : authHeader(TOKEN, link);
  return { ...(a ? { authorization: a } : {}), "content-type": "application/json" };
};

/** A failed call, with the server's list of problems when it sent one (ED-10). */
export class ApiError extends Error {
  status: number;
  problems: string[];
  constructor(status: number, problems: string[]) {
    super(`${status}`);
    this.status = status;
    this.problems = problems;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { ...init, headers: headers() });
  if (!r.ok) throw new ApiError(r.status, ((await r.json().catch(() => ({}))) as { problems?: string[] }).problems ?? []);
  return (r.status === 204 ? undefined : await r.json()) as T;
}
const trip = (id: string) => `/api/trips/${encodeURIComponent(id)}`;

export type Me = { role: "admin" | "read" | "propose" } | { role: "link"; tripId: string } | { role: "traveler" | "planner"; tripId: string; travelerId: string };
/** A traveler's personal link as the settings show it (AU-11). */
export type PersonLinkInfo = { travelerId: string; role: "traveler" | "planner"; secret: string };

export const api = {
  me: () => call<Me>("/api/me"),
  login: (password: string) => call<void>("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => call<void>("/api/logout", { method: "POST" }),
  link: (id: string) => call<{ secret: string }>(`${trip(id)}/link`),
  newLink: (id: string) => call<{ secret: string }>(`${trip(id)}/link`, { method: "POST" }),
  people: (id: string) => call<PersonLinkInfo[]>(`${trip(id)}/people`),
  setPerson: (id: string, travelerId: string, role: PersonLinkInfo["role"]) =>
    call<PersonLinkInfo>(`${trip(id)}/people/${encodeURIComponent(travelerId)}`, { method: "PUT", body: JSON.stringify({ role }) }),
  renewPerson: (id: string, travelerId: string) => call<PersonLinkInfo>(`${trip(id)}/people/${encodeURIComponent(travelerId)}/renew`, { method: "POST" }),
  removePerson: (id: string, travelerId: string) => call<void>(`${trip(id)}/people/${encodeURIComponent(travelerId)}`, { method: "DELETE" }),
  trips: () => call<Trip[]>("/api/trips"),
  create: (title: string) => call<Trip>("/api/trips", { method: "POST", body: JSON.stringify({ title }) }),
  remove: (id: string) => call<void>(trip(id), { method: "DELETE" }),
  change: (t: Trip, ops: Op[], reason: string) =>
    call<unknown>(`${trip(t.id)}/changes`, { method: "POST", body: JSON.stringify({ baseRevision: t.revision, ops, reason }) }),
  traffic: (tripId: string, dayId: string) => call<Traffic>(`${trip(tripId)}/days/${encodeURIComponent(dayId)}/traffic`),
  settings: () => call<Settings & { aiService: boolean }>("/api/settings"),
  saveSettings: (s: Settings) => call<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  image: async (id: string) => {
    const r = await fetch(`${trip(id)}/image`, { headers: headers() });
    if (!r.ok) throw new Error(`${r.status} image`);
    return URL.createObjectURL(await r.blob());
  },
};

export const maskedToken = () => (TOKEN ? "••••••••••••" + TOKEN.slice(-4) : "");
