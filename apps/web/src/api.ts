import type { BookingReading, Op, Settings, TicketFile, Trip } from "@trip/schema";
import type { Traffic } from "./transport.ts";

import { dropAllCopies, dropCopy, flush, loadCopy, loadQueue, saveCopy, saveQueue, type Copy, type Expense, type Sent, type Waiting } from "./offline.ts";
import { sv } from "./sv.ts";
import { addLink, authHeader, cookieLinks, linkCookie, linkForTrip, linkHash, linksCookie, parseLinkHash, removeLink } from "./access.ts";

// The development token is used only by the local dev server; a build never contains it (AU-08).
const TOKEN = import.meta.env.DEV ? (import.meta.env.VITE_TRIP_TOKEN ?? "") : "";
const LINK_KEY = "mytrip.link", LINKS_KEY = "mytrip.links";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
/** Every link kept on the phone, in local storage and in the cookie that reaches the installed app, whose storage is
 * separate from Safari's (PW-02, PW-16). The one link kept before PW-16 is taken along. */
function storedLinks(): string[] {
  let keys: string[] = [];
  try { keys = (JSON.parse(read(LINKS_KEY) ?? "[]") as string[]).filter((k) => parseLinkHash(linkHash(k))); } catch { /* unreadable: start over */ }
  for (const k of [read(LINK_KEY), ...cookieLinks(document.cookie)]) if (k && parseLinkHash(linkHash(k))) keys = addLink(keys, k);
  return keys;
}
let links = storedLinks();
const keep = () => {
  try { localStorage.setItem(LINKS_KEY, JSON.stringify(links)); localStorage.removeItem(LINK_KEY); } catch { /* private mode: for this visit only */ }
  document.cookie = linksCookie(links);
  document.cookie = linkCookie(null);
};
/** True in the app opened from the home screen (PW-15). */
export const installed = (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;

/** A share link in the address is kept on the device and removed from the address bar (AU-02, PW-16). #admin forgets them all (AU-23, PW-17). */
const fromUrl = parseLinkHash(location.hash);
if (fromUrl?.kind === "link") {
  links = addLink(links, fromUrl.key);
  keep();
  history.replaceState(null, "", location.pathname + location.search);
}
if (fromUrl?.kind === "admin") { links = []; keep(); try { dropAllCopies(localStorage); } catch { /* nothing stored */ } } // PW-17
// A link or #admin typed into a tab that is already open only changes the fragment, so load the page again to use it (AU-23).
addEventListener("hashchange", () => { if (parseLinkHash(location.hash)) location.reload(); });
/** A tapped notice opens the app with ?trip=, which picks the phone's link for that trip (NT-04). */
const askedTrip = new URLSearchParams(location.search).get("trip");
if (askedTrip !== null) history.replaceState(null, "", location.pathname + location.hash);
/** The link in use: the one just opened, the one of a tapped notice's trip, or the only one on the phone; with several,
 * the start page asks (PW-16). */
let link = fromUrl?.kind === "link" ? fromUrl.key : (askedTrip && linkForTrip(links, askedTrip)) || (links.length === 1 ? links[0] : null);
/** True when the page was opened with #admin, to reach the admin login from a device that holds a link. */
export const askedForAdmin = fromUrl?.kind === "admin";
/** The link in use no longer works: it leaves the phone, and the only one left, if any, is used (AU-07, PW-17). */
export const forgetLink = () => { if (link) removeDeviceLink(link); link = links.length === 1 ? links[0] : null; };
/** The link this device uses, to open the same one in Safari (PW-15). */
export const linkKey = () => (askedForAdmin ? null : link);
/** The links on the phone, for the start page (PW-16). */
export const deviceLinks = () => (askedForAdmin ? [] : links);
export const needsChoice = () => !askedForAdmin && !link && links.length > 1;
export const chooseLink = (key: string | null) => { link = key; };
export const removeDeviceLink = (key: string) => { // PW-17: the link and what the phone kept for it
  links = removeLink(links, key); if (link === key) link = null; keep();
  try { dropCopy(localStorage, key); } catch { /* nothing stored */ }
};

const headers = (key = link) => {
  const a = askedForAdmin ? authHeader(TOKEN, null) : authHeader(TOKEN, key);
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

/** Offline: the time the trip shown was fetched; null with a network (PW-04). Listeners hear every change. */
let offline: { at?: string } | null = null;
const listeners = new Set<() => void>();
export const offlineState = () => offline;
export const onOffline = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const setOffline = (next: { at?: string } | null) => {
  if (JSON.stringify(next) === JSON.stringify(offline)) return;
  offline = next;
  listeners.forEach((f) => f());
};
addEventListener("online", () => setOffline(null));
/** The link's copy on the phone, to read or write (PW-03). */
export const copy = {
  load: (): Copy | null => { try { return link ? loadCopy(localStorage, link) : null; } catch { return null; } },
  save: (part: Parameters<typeof saveCopy>[2]) => { try { if (link) saveCopy(localStorage, link, part, new Date().toISOString()); } catch { /* blocked */ } },
};
/** The link's expenses that the server does not have yet (PW-06). */
export const queue = {
  load: (): Waiting[] => { try { return link ? loadQueue(localStorage, link) : []; } catch { return []; } },
  save: (q: Waiting[]) => { try { if (link) saveQueue(localStorage, link, q); } catch { /* blocked */ } },
};
/** One expense to the server. No network, a conflict or a server error: try later; otherwise the reason (PW-07, PW-09). */
async function sendExpense(tripId: string, e: Expense): Promise<Sent> {
  try {
    await call(`${trip(tripId)}/changes`, { method: "POST", signal: AbortSignal.timeout(20_000), // a hanging request must not hold up the queue
      body: JSON.stringify({ baseRevision: 0, ops: [{ op: "add", path: "expenses/-", value: e }], reason: "add expense" }) });
    return { ok: true };
  } catch (x) {
    if (!(x instanceof ApiError) || x.status === 409 || x.status >= 500) return { offline: true };
    return { failed: x.status === 403 ? sv.queue.forbidden : x.problems.join(" ") || sv.queue.rejected(x.status) };
  }
}
let flushing = false;
/** Sends the waiting expenses; ones added meanwhile stay. True when the server got at least one (PW-07). */
export async function sendWaiting(tripId: string): Promise<boolean> {
  const before = queue.load();
  if (flushing || !before.some((x) => x.state === "waiting")) return false;
  flushing = true;
  try {
    const after = await flush(before, (e) => sendExpense(tripId, e));
    const sent = before.filter((x) => !after.some((a) => a.expense.id === x.expense.id)).map((x) => x.expense.id);
    queue.save(queue.load().filter((x) => !sent.includes(x.expense.id)).map((x) => after.find((a) => a.expense.id === x.expense.id) ?? x));
    return sent.length > 0;
  } finally { flushing = false; }
}

/** A read that falls back on the phone's copy when the server cannot be reached; only links keep one (PW-03, PW-05). */
async function kept<T>(part: "me" | "trips", path: string): Promise<T> {
  try {
    const v = await call<T>(path);
    copy.save({ [part]: v });
    setOffline(null);
    return v;
  } catch (e) {
    const c = copy.load();
    if (e instanceof ApiError || c?.[part] === undefined) throw e;
    setOffline({ at: c.at });
    return c[part] as T;
  }
}

async function call<T>(path: string, init: RequestInit = {}, key = link): Promise<T> {
  const r = await fetch(path, { ...init, headers: headers(key) });
  if (!r.ok) throw new ApiError(r.status, ((await r.json().catch(() => ({}))) as { problems?: string[] }).problems ?? []);
  return (r.status === 204 ? undefined : await r.json()) as T;
}
const trip = (id: string) => `/api/trips/${encodeURIComponent(id)}`;

export type Me = { role: "admin" | "read" | "propose" } | { role: "link"; tripId: string } | { role: "traveler" | "planner"; tripId: string; travelerId: string };
/** A mail to the trip's inbox, read into a proposed booking that waits for review (BK-15, BK-17). */
export type MailProposal = { id: string; status: "pending" | "approved" | "rejected"; source?: { kind: "mail"; from: string; subject: string; at: string }; booking?: BookingReading & { files?: TicketFile[] } };
/** A traveler's personal link as the settings show it (AU-11). */
export type PersonLinkInfo = { travelerId: string; role: "traveler" | "planner"; secret: string };

export const api = {
  me: () => kept<Me>("me", "/api/me"),
  login: (password: string) => call<void>("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => call<void>("/api/logout", { method: "POST" }),
  link: (id: string) => call<{ secret: string }>(`${trip(id)}/link`),
  newLink: (id: string) => call<{ secret: string }>(`${trip(id)}/link`, { method: "POST" }),
  people: (id: string) => call<PersonLinkInfo[]>(`${trip(id)}/people`),
  setPerson: (id: string, travelerId: string, role: PersonLinkInfo["role"]) =>
    call<PersonLinkInfo>(`${trip(id)}/people/${encodeURIComponent(travelerId)}`, { method: "PUT", body: JSON.stringify({ role }) }),
  renewPerson: (id: string, travelerId: string) => call<PersonLinkInfo>(`${trip(id)}/people/${encodeURIComponent(travelerId)}/renew`, { method: "POST" }),
  removePerson: (id: string, travelerId: string) => call<void>(`${trip(id)}/people/${encodeURIComponent(travelerId)}`, { method: "DELETE" }),
  trips: () => kept<Trip[]>("trips", "/api/trips"),
  tripsAs: (key: string) => call<Trip[]>("/api/trips", {}, key), // the trip of one link on the phone (PW-16)
  create: (title: string) => call<Trip>("/api/trips", { method: "POST", body: JSON.stringify({ title }) }),
  remove: (id: string) => call<void>(trip(id), { method: "DELETE" }),
  change: (t: Trip, ops: Op[], reason: string) =>
    call<unknown>(`${trip(t.id)}/changes`, { method: "POST", body: JSON.stringify({ baseRevision: t.revision, ops, reason }) }),
  pushKey: () => call<{ key: string }>("/api/push/key"), // NT-03, NT-05
  subscribe: (tripId: string, sub: PushSubscriptionJSON) => call<void>(`${trip(tripId)}/push`, { method: "PUT", body: JSON.stringify(sub) }),
  unsubscribe: (tripId: string, endpoint: string, key = link) => call<void>(`${trip(tripId)}/push`, { method: "DELETE", body: JSON.stringify({ endpoint }) }, key),
  traffic: (tripId: string, dayId: string) => call<Traffic>(`${trip(tripId)}/days/${encodeURIComponent(dayId)}/traffic`),
  settings: () => call<Settings & { aiService: boolean }>("/api/settings"),
  saveSettings: (s: Settings) => call<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  // BK-09, BK-10: ticket files go up and come down as they are, with the link's credentials.
  uploadFile: async (tripId: string, blob: Blob, name: string) => {
    const r = await fetch(`${trip(tripId)}/files?name=${encodeURIComponent(name)}`, { method: "POST", headers: { ...headers(), "content-type": blob.type }, body: blob });
    if (!r.ok) throw new ApiError(r.status, []);
    return (await r.json()) as TicketFile;
  },
  file: async (tripId: string, id: string) => {
    const r = await fetch(`${trip(tripId)}/files/${encodeURIComponent(id)}`, { headers: headers() });
    if (!r.ok) throw new ApiError(r.status, []);
    return r.blob();
  },
  proposals: (id: string) => call<MailProposal[]>(`${trip(id)}/proposals`), // BK-17
  approveMail: (t: Trip, pid: string, ops: Op[]) =>
    call<unknown>(`${trip(t.id)}/proposals/${encodeURIComponent(pid)}/approve`, { method: "POST", body: JSON.stringify({ baseRevision: t.revision, ops }) }),
  rejectMail: (tripId: string, pid: string) => call<unknown>(`${trip(tripId)}/proposals/${encodeURIComponent(pid)}/reject`, { method: "POST" }),
  inbox: (id: string) => call<{ enabled: boolean; address?: string }>(`${trip(id)}/inbox`), // BK-14
  newInbox: (id: string) => call<{ address: string }>(`${trip(id)}/inbox`, { method: "POST" }),
  image: async (id: string, key = link) => {
    const r = await fetch(`${trip(id)}/image`, { headers: headers(key) });
    if (!r.ok) throw new Error(`${r.status} image`);
    return URL.createObjectURL(await r.blob());
  },
};

export const maskedToken = () => (TOKEN ? "••••••••••••" + TOKEN.slice(-4) : "");
