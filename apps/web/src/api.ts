import type { BookingReading, Op, Settings, TicketFile, Trip } from "@trip/schema";
import type { TransitAnswer, Traffic } from "./transport.ts";

import { accountSlot, dropAllCopies, dropCopy, flush, forgetAccount, keepAccount, loadCopy, loadQueue, saveCopy, saveQueue, sendError, serial, storedAccount, useCopy, loadVerdicts, saveVerdicts, verdictOps, type WaitingVerdict, timeoutSignal, triedAt, unrated, withRate, type Copy, type Expense, type Sent, type Waiting } from "./offline.ts";
import { sv } from "./sv.ts";
import { addLink, authHeader, cookieLinks, linkCookie, linkForTrip, linkHash, linksCookie, parseLinkHash, parseSetupHash, removeLink, type Me } from "./access.ts";
export type { Me } from "./access.ts";

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
addEventListener("hashchange", () => { if (parseLinkHash(location.hash) || parseSetupHash(location.hash)) location.reload(); }); // US-04: a password link too
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
export type WishCredit = { page: string; author?: string; licence: string; licenceUrl?: string }; // DB-07
export type CacheSummary = { trips: number; images: number; files: number; bytes: number }; // DB-13
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
/** The account last logged in on the phone, whose copy is used when no link is (PW-22). */
let account = (() => { try { return storedAccount(localStorage); } catch { return null; } })();
/** Where the phone keeps what it got: the link in use, else the account (PW-03, PW-22). */
const slot = () => link ?? (account ? accountSlot(account) : null);
/** An account answered: its copy is kept from now on, and another account's leaves the phone (PW-22). */
function adoptAccount(me: Me) {
  if (link || !("user" in me)) return;
  account = me.user.id;
  try { keepAccount(localStorage, account); } catch { /* blocked: online only */ }
}
/** Logging out: the account's copy and waiting expenses leave the phone (PW-23). */
export const forgetDeviceAccount = () => { account = null; try { forgetAccount(localStorage); } catch { /* nothing stored */ } };
/** The copy of the link or account on the phone, to read or write (PW-03, PW-22). */
export const copy = {
  load: (): Copy | null => { const k = slot(); try { return k ? loadCopy(localStorage, k) : null; } catch { return null; } },
  save: (part: Parameters<typeof saveCopy>[2]) => { const k = slot(); try { if (k) saveCopy(localStorage, k, part, new Date().toISOString()); } catch { /* blocked */ } },
};
/** The expenses of the link or account that the server does not have yet (PW-06, PW-22). */
export const queue = {
  load: (): Waiting[] => { const k = slot(); try { return k ? loadQueue(localStorage, k) : []; } catch { return []; } },
  save: (q: Waiting[]) => { const k = slot(); try { if (k) saveQueue(localStorage, k, q); } catch { /* blocked */ } },
};
/** One expense to the server. No network, a conflict or a server error: try later and say why, with when; otherwise the reason
 * (PW-07, PW-09, PW-18, PW-19). A request without an answer is given up after 20 seconds, in every browser (PW-19). */
async function sendExpense(tripId: string, e: Expense): Promise<Sent> {
  try {
    await call(`${trip(tripId)}/changes`, { method: "POST", signal: timeoutSignal(20_000), // a hanging request must not hold up the queue
      body: JSON.stringify({ baseRevision: 0, ops: [{ op: "add", path: "expenses/-", value: e }], reason: "add expense" }) });
    return { ok: true };
  } catch (x) {
    const r = sendError(x);
    return "offline" in r && r.why ? { offline: true, why: triedAt(r.why, new Date()) } : r;
  }
}
let sendingTo = "";
/** A waiting expense in another currency, converted with the rate of its date; null while no rate can be had (UP-49). */
async function rated(e: Expense, home: string | undefined) {
  if (!home) return null;
  const { rateFor } = await import("./currency.ts");
  const r = await rateFor((e.foreign as { currency: string }).currency, home, String(e.date));
  return r && withRate(e, r);
}
/** Sends the waiting expenses; ones added meanwhile stay. True when the server got at least one (PW-07). One send at a time: a
 * call during a send waits for it and sends again, so "Skicka nu" always tries (PW-19). */
const sendQueue = serial(async () => {
  const before = queue.load();
  if (!before.some((x) => x.state === "waiting")) return false;
  const of = (e: Expense) => before.find((x) => x.expense.id === e.id);
  const after = await flush(before, async (e) => {
    const ready = unrated(e) ? await rated(e, of(e)?.home) : e; // the rate first (UP-49)
    if (!ready) return { offline: true, why: triedAt(sv.queue.noRate((e.foreign as { currency: string }).currency), new Date()) };
    return sendExpense(of(e)?.tripId ?? sendingTo, ready); // an account's goes to its own trip (PW-22)
  });
  const sent = before.filter((x) => !after.some((a) => a.expense.id === x.expense.id)).map((x) => x.expense.id);
  queue.save(queue.load().filter((x) => !sent.includes(x.expense.id)).map((x) => after.find((a) => a.expense.id === x.expense.id) ?? x));
  return sent.length > 0;
});
/** Verdicts given without a network, kept for the link or account (UP-53); listeners hear every change. */
const verdictListeners = new Set<() => void>();
export const verdictQueue = {
  load: (): WaitingVerdict[] => { const k = slot(); try { return k ? loadVerdicts(localStorage, k) : []; } catch { return []; } },
  save: (q: WaitingVerdict[]) => { const k = slot(); try { if (k) saveVerdicts(localStorage, k, q); } catch { /* blocked */ } verdictListeners.forEach((f) => f()); },
  listen: (f: () => void) => { verdictListeners.add(f); return () => { verdictListeners.delete(f); }; },
};
/** True without a network, or while the server cannot be reached (PW-04, PW-26). */
export const isOffline = () => !navigator.onLine || offline !== null;
/** Sends the waiting verdicts, each as the change from the latest trip (UP-53). A conflict, a server error or no network waits for
 * the next try; any other refusal drops it. True when the server got at least one. */
export const sendVerdicts = serial(async () => {
  let sent = false;
  for (const v of verdictQueue.load()) {
    let trips: Trip[];
    try { trips = await call<Trip[]>("/api/trips"); } catch { break; }
    const t = trips.find((x) => x.id === v.tripId), ops = t ? verdictOps(t, v) : [];
    try {
      if (t && ops.length) { await call(`${trip(t.id)}/changes`, { method: "POST", body: JSON.stringify({ baseRevision: t.revision, ops, reason: `verdict ${v.verdict ?? "none"}` }) }); sent = true; }
    } catch (x) {
      if (!(x instanceof ApiError) || x.status === 409 || x.status >= 500) break;
    }
    verdictQueue.save(verdictQueue.load().filter((y) => !(y.tripId === v.tripId && y.dreamId === v.dreamId && y.by === v.by && y.verdict === v.verdict))); // a newer one stays
  }
  return sent;
});
export function sendWaiting(tripId = ""): Promise<boolean> {
  sendingTo = tripId;
  return sendQueue();
}

/** A read that falls back on the phone's copy when the server cannot be reached or fails; links and accounts keep one (PW-03, PW-05, PW-22, PW-26). */
async function kept<T>(part: "me" | "trips", path: string): Promise<T> {
  try {
    const v = await call<T>(path);
    if (part === "me") adoptAccount(v as Me);
    copy.save({ [part]: v });
    setOffline(null);
    return v;
  } catch (e) {
    const c = copy.load();
    if (!useCopy(e) || c?.[part] === undefined) throw e; // PW-26: a server error too
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

/** A mail to the trip's inbox, read into a proposed booking that waits for review (BK-15, BK-17). */
export type MailProposal = { id: string; status: "pending" | "approved" | "rejected"; source?: { kind: "mail"; from: string; subject: string; at: string }; booking?: BookingReading & { files?: TicketFile[] } };
/** A traveler's personal link as the settings show it (AU-11). */
export type PersonLinkInfo = { travelerId: string; role: "traveler" | "planner"; secret: string; account?: string; login?: "none" | "invited" | "active" | "disabled" }; // account: US-21, login: US-36
/** An account as the superuser's list shows it (US-02). */
export type UserInfo = { id: string; name: string; email: string; superuser: boolean; disabled: boolean; ai: boolean; createdAt: string; lastLogin?: string; password: boolean; google: boolean };
export type SetupLink = { secret: string; expires: string }; // US-04
export type FeedbackNote = { id: string; at: string; name: string; text: string; page: string; tripId?: string; reply?: string; replyAt?: string }; // US-27, US-34
export type MyNote = { id: string; at: string; text: string; page: string; reply?: string; replyAt?: string }; // US-34
export type TripUsage = { tripId: string; title: string; owner: string; from?: string; to?: string; memories: number;
  people: { name: string; days: Record<"dr" | "nala" | "up" | "mi", number>; upDuring: number; changes: number }[]; // US-29
  ai?: { name: string; calls: number; usd: number }[] }; // AI-03
/** A helper on a trip: whether it can run and is on, its latest run and about how many runs are left (AI-68, AI-72). */
export type HelperStatus = { available: boolean; on: boolean; at?: string; result?: string; remaining: number };
/** How an AI feature went: a proposal (or none worth making), or why it did not run (AI-03, AI-64, AI-65). */
export type AiAdded = { activities: number; tasks: number; bookings: number; wishes: number; info?: number; packing?: number }; // info: AI-87, packing: AI-89
export type AiStart = { ok: true; proposalId: string | null; proposalIds: string[]; reason: string; applied?: boolean; added?: AiAdded; memoriesFrom?: string[] } | { ok: false; error: string; scope?: string }; // memoriesFrom: AI-91

type AiRead<T> = { ok: true; reading: T } | { ok: false; error: string; scope?: string };
async function aiCall<T>(path: string, body: BodyInit, type: string): Promise<AiRead<T>> {
  try {
    const r = await fetch(path, { method: "POST", headers: { ...headers(), "content-type": type }, body });
    const b = (await r.json().catch(() => ({}))) as { reading?: T; error?: string; scope?: string };
    return r.ok && b.reading ? { ok: true, reading: b.reading } : { ok: false, error: b.error ?? (r.status === 403 ? "forbidden" : "failed"), ...(b.scope ? { scope: b.scope } : {}) };
  } catch { return { ok: false, error: "network" }; }
}

export const api = {
  me: () => kept<Me>("me", "/api/me"),
  login: (password: string, email = "") => call<void>("/api/login", { method: "POST", body: JSON.stringify(email.trim() ? { email, password } : { password }) }), // US-07; no address: the admin password (US-18)
  authConfig: () => call<{ google: boolean; reset?: boolean }>("/api/auth/config"), // US-10, US-35
  reset: (email: string) => call<{ sent: true }>("/api/reset", { method: "POST", body: JSON.stringify({ email }) }), // US-35
  setupInfo: (user: string, secret: string) => call<{ name: string; email: string }>("/api/setup/info", { method: "POST", body: JSON.stringify({ user, secret }) }), // US-05
  setup: (user: string, secret: string, password: string, consent = false) => call<void>("/api/setup", { method: "POST", body: JSON.stringify({ user, secret, password, consent }) }),
  consent: () => call<void>("/api/consent", { method: "POST" }), // US-26
  feedback: (text: string, page: string, tripId?: string) => call<void>("/api/feedback", { method: "POST", body: JSON.stringify({ text, page, tripId }) }), // US-27
  notes: () => call<FeedbackNote[]>("/api/feedback"),
  myNotes: () => call<MyNote[]>("/api/feedback/mine"), // US-34
  reply: (id: string, text: string) => call<FeedbackNote>(`/api/feedback/${encodeURIComponent(id)}/reply`, { method: "PUT", body: JSON.stringify({ text }) }),
  seen: (tripId: string, tab: string) => call<void>(`${trip(tripId)}/seen`, { method: "POST", body: JSON.stringify({ tab }) }), // US-28
  usage: () => call<TripUsage[]>("/api/usage"), // US-29
  ai: async (tripId: string, feature: string, body?: { apply: true }): Promise<AiStart> => { // apply: the first run after "Skapa med AI" (AI-80) // AI-65: the server's reason is kept, unlike call()
    try {
      const r = await fetch(`${trip(tripId)}/ai/${encodeURIComponent(feature)}`, { method: "POST", headers: headers(), body: JSON.stringify(body ?? {}) });
      const b = (await r.json().catch(() => ({}))) as { proposalId?: string | null; proposalIds?: string[]; reason?: string; error?: string; scope?: string; applied?: boolean | AiAdded; memoriesFrom?: string[] };
      return r.ok ? { ok: true, proposalId: b.proposalId ?? null, proposalIds: b.proposalIds ?? (b.proposalId ? [b.proposalId] : []), reason: b.reason ?? "", ...(b.applied === true ? { applied: true } : b.applied ? { added: b.applied } : {}), ...(b.memoriesFrom?.length ? { memoriesFrom: b.memoriesFrom } : {}) } // applied: the draft of a new trip (AI-78)
        : { ok: false, error: b.error ?? (r.status === 403 ? "forbidden" : "failed"), ...(b.scope ? { scope: b.scope } : {}) };
    } catch { return { ok: false, error: "network" }; }
  },
  // AI-60, AI-42: a reading with AI, with the server's reason when it did not run (as ai())
  mailRead: (tripId: string, pid: string) => aiCall<BookingReading & { ai: string[] }>(`${trip(tripId)}/mailread/${encodeURIComponent(pid)}`, "{}", "application/json"),
  receipt: (tripId: string, photo: Blob) => aiCall<{ amount?: number; currency?: string; date?: string; text?: string; category?: string }>(`${trip(tripId)}/receipt`, photo, photo.type),
  aiStatus: (tripId: string) => call<{ enabled: boolean; consent: boolean; helpers: Record<string, HelperStatus> }>(`${trip(tripId)}/ai`), // AI-68, AI-72
  aiConsent: (tripId: string, helper?: string) => call<{ revision: number }>(`${trip(tripId)}/ai/consent`, { method: "POST", body: JSON.stringify(helper ? { helper } : {}) }), // AI-64, AI-68
  users: () => call<UserInfo[]>("/api/users"), // US-02, US-03, US-04, US-12
  addUser: (name: string, email: string) => call<{ user: UserInfo; setup: SetupLink }>("/api/users", { method: "POST", body: JSON.stringify({ name, email }) }),
  changeUser: (id: string, patch: Partial<Pick<UserInfo, "disabled" | "superuser" | "ai">>) => call<UserInfo>(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  newSetup: (id: string) => call<SetupLink>(`/api/users/${encodeURIComponent(id)}/setup`, { method: "POST" }),
  removeUser: (id: string) => call<void>(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  logout: () => call<void>("/api/logout", { method: "POST" }),
  link: (id: string) => call<{ secret: string }>(`${trip(id)}/link`),
  newLink: (id: string) => call<{ secret: string }>(`${trip(id)}/link`, { method: "POST" }),
  people: (id: string) => call<PersonLinkInfo[]>(`${trip(id)}/people`),
  setPerson: (id: string, travelerId: string, role: PersonLinkInfo["role"], account?: string | null) => // account left out: kept (US-21)
    call<PersonLinkInfo>(`${trip(id)}/people/${encodeURIComponent(travelerId)}`, { method: "PUT", body: JSON.stringify(account === undefined ? { role } : { role, account }) }),
  invite: (id: string, travelerId: string) => // US-30
    call<{ user: string; setup: SetupLink } | { exists: true }>(`${trip(id)}/people/${encodeURIComponent(travelerId)}/invite`, { method: "POST" }),
  renewPerson: (id: string, travelerId: string) => call<PersonLinkInfo>(`${trip(id)}/people/${encodeURIComponent(travelerId)}/renew`, { method: "POST" }),
  removePerson: (id: string, travelerId: string) => call<void>(`${trip(id)}/people/${encodeURIComponent(travelerId)}`, { method: "DELETE" }),
  trips: () => kept<Trip[]>("trips", "/api/trips"),
  tripsAs: (key: string) => call<Trip[]>("/api/trips", {}, key), // the trip of one link on the phone (PW-16)
  create: (title: string, purpose = "") => call<Trip>("/api/trips", { method: "POST", body: JSON.stringify({ title, purpose }) }), // AI-10: the description as purpose
  remove: (id: string) => call<void>(trip(id), { method: "DELETE" }),
  change: (t: Trip, ops: Op[], reason: string) =>
    call<unknown>(`${trip(t.id)}/changes`, { method: "POST", body: JSON.stringify({ baseRevision: t.revision, ops, reason }) }),
  pushKey: () => call<{ key: string }>("/api/push/key"), // NT-03, NT-05
  subscribe: (tripId: string, sub: PushSubscriptionJSON) => call<void>(`${trip(tripId)}/push`, { method: "PUT", body: JSON.stringify(sub) }),
  unsubscribe: (tripId: string, endpoint: string, key = link) => call<void>(`${trip(tripId)}/push`, { method: "DELETE", body: JSON.stringify({ endpoint }) }, key),
  traffic: (tripId: string, dayId: string) => call<Traffic>(`${trip(tripId)}/days/${encodeURIComponent(dayId)}/traffic`),
  transit: (tripId: string, dayId: string, aid: string, from?: { lat: number; lng: number }) => // TR-23; from: the phone's position
    call<TransitAnswer>(`${trip(tripId)}/days/${encodeURIComponent(dayId)}/activities/${encodeURIComponent(aid)}/transit${from ? `?from=${from.lat.toFixed(5)},${from.lng.toFixed(5)}` : ""}`),
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
  // DB-07, DB-12, DB-13: wish images from Commons through our own server, own photos, and the cache of ended trips.
  findWishImage: (tripId: string, wid: string, query: string) =>
    call<{ found?: WishCredit | null; preview?: string; failed?: true }>(`${trip(tripId)}/dreams/${encodeURIComponent(wid)}/image/find`, { method: "POST", body: JSON.stringify({ query }) }),
  chooseWishImage: (tripId: string, wid: string, query: string) =>
    call<{ revision: number }>(`${trip(tripId)}/dreams/${encodeURIComponent(wid)}/image`, { method: "POST", body: JSON.stringify({ query }) }),
  autoWishImage: (tripId: string, wid: string) => call<unknown>(`${trip(tripId)}/dreams/${encodeURIComponent(wid)}/image/auto`, { method: "POST", body: "{}" }),
  uploadWishImage: async (tripId: string, wid: string, blob: Blob) => {
    const r = await fetch(`${trip(tripId)}/dreams/${encodeURIComponent(wid)}/image/upload`, { method: "POST", headers: { ...headers(), "content-type": blob.type }, body: blob });
    if (!r.ok) throw new ApiError(r.status, []);
  },
  endedCache: () => call<CacheSummary>("/api/image-cache/ended"),
  clearEndedCache: () => call<CacheSummary>("/api/image-cache/ended", { method: "POST" }),
  proposals: (id: string) => call<MailProposal[]>(`${trip(id)}/proposals`), // BK-17
  approveMail: (t: Trip, pid: string, ops: Op[]) =>
    call<unknown>(`${trip(t.id)}/proposals/${encodeURIComponent(pid)}/approve`, { method: "POST", body: JSON.stringify({ baseRevision: t.revision, ops }) }),
  rejectMail: (tripId: string, pid: string) => call<unknown>(`${trip(tripId)}/proposals/${encodeURIComponent(pid)}/reject`, { method: "POST" }),
  approve: (tripId: string, pid: string) => call<{ result: { problems?: string[]; revision?: number } }>(`${trip(tripId)}/proposals/${encodeURIComponent(pid)}/approve`, { method: "POST" }), // MC-18
  inbox: (id: string) => call<{ enabled: boolean; address?: string }>(`${trip(id)}/inbox`), // BK-27: mail import on, for this viewer
  openInbox: (id: string) => call<{ address: string }>(`${trip(id)}/inbox`, { method: "POST" }), // BK-26: made when first asked for
  replaceInbox: (id: string) => call<{ address: string }>(`${trip(id)}/inbox/replace`, { method: "POST" }),
  mailToWish: (tripId: string, pid: string) => call<unknown>(`${trip(tripId)}/proposals/${encodeURIComponent(pid)}/wish`, { method: "POST" }), // BK-29
  image: async (id: string, key = link) => {
    const r = await fetch(`${trip(id)}/image`, { headers: headers(key) });
    if (!r.ok) throw new Error(`${r.status} image`);
    return URL.createObjectURL(await r.blob());
  },
};

export const maskedToken = () => (TOKEN ? "••••••••••••" + TOKEN.slice(-4) : "");
