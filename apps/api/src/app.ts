import { Hono, type Context } from "hono";
import { cacheKey, commonsImage, fetchImage, IMAGE_MAX, imageType, type CommonsImage } from "./wishimage.ts";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { CAP_ACCOUNT_USD, CAP_USD, Settings, Trip, aiOn, aiOnForTrip, TicketFile, accessFor, applyOps, atLeast, checkTrip, pinBreaks, describeError, hiddenFromIn, opNeeds, secretsOf, similarTitles, whoFor, type AccessRole, type BookingReading, type Op, type Part, type WishReading } from "@trip/schema";
import { checkTraffic, type TrafficOpts } from "./traffic.ts";
import { NO_COST, runAi, sameSuggestion, type AiCall, type AiFeature, type AiResult } from "./ai.ts";
import { FEATURES } from "./ai-features.ts";
import { describeChange, noticeBody } from "./notify.ts";
import { pushRequest, vapidPublicKey } from "./push.ts";
import { sv } from "../../web/src/sv.ts";
import { addWish, MIN_PHOTO, sortMail } from "./mail.ts";
import { checkPassword, firstSuper, googleAuthUrl, googleIdentity, hashPassword, memberships, normEmail, PASSWORD_MIN, pkce, publicUser, SETUP_DAYS, sha256, validEmail, type Google, type User } from "./users.ts";
export type { User } from "./users.ts";

export type Proposal = {
  id: string; tripId: string; baseRevision: number; ops: Op[]; reason: string; status: "pending" | "approved" | "rejected"; at: string;
  source?: { kind: "mail"; from: string; subject: string; at: string } // a mail to the trip's inbox (BK-15)
    | { kind: "ai"; feature: string; by: string; at: string; item?: boolean; day?: string }; // an AI feature in the app (AI-01, AI-65); item: one suggestion of a helper (AI-70); day: the day its activity is on (AI-77)
  booking?: BookingReading & { files?: TicketFile[] }; // what was read from it; approved with the edited booking (BK-17)
  wish?: WishReading & { source: string }; // the same mail read as a wish, for Gör till önskan (BK-29)
};
/** A ticket file's owner and type; its bytes are kept apart from the trip data (BK-13). */
export type FileMeta = { id: string; tripId: string; type: TicketFile["type"] | "image/webp" }; // webp: wish images (DB-08); tripId "_commons": the shared cache (DB-11)
export type LogEntry = { at: string; tripId: string; actor: string; reason: string; ops: Op[] };
/** A traveler's personal link to one trip, with the permission Resenär (traveler) or Planerare (planner) (AU-11). */
export type PersonLink = { tripId: string; travelerId: string; secret: string; role: "traveler" | "planner"; account?: string }; // account: the tied address (US-21)
/** A phone that wants notices for a trip (NT-03): who is a traveler id, "follower" for the common link, or "admin". */
/** A note sent with "Tyck till" during the beta (US-27). */
export type Feedback = { id: string; at: string; who: string; name: string; text: string; page: string; tripId?: string };
/** That a consenting user opened one of the four pages of a trip on a day, in the trip's time zone (US-28). */
export type Usage = { tripId: string; who: string; tab: "dr" | "nala" | "up" | "mi"; day: string };
export type PushSub = { tripId: string; who: string; endpoint: string; p256dh: string; auth: string };
/** One call to the AI service and what it cost; who is an account id, a traveler id of a link, or "admin" (AI-03). */
/** A helper's latest run on a trip, and the fingerprint of the data it used (AI-68, AI-69). */
export type AiHelperState = { at: string; result: "proposal" | "nothing" | "error" | "cap"; fingerprint?: string };
/** The cost of a run before any has been made, for the runs left (AI-72). */
export const AI_RUN_ESTIMATE_USD = 0.15;
export type AiUse = { id: string; at: string; month: string; tripId: string; who: string; feature: string; usd: number; result: "proposal" | "nothing" | "error" };

export interface Store {
  list(): Promise<Trip[]>;
  load(id: string): Promise<Trip | undefined>;
  /** With `baseRevision`, saves only if the stored trip still has that revision; false when another change came first (DP-03). */
  save(next: Trip, baseRevision?: number): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  image(name: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  /** Share link secrets by trip id (AU-01). */
  links(): Promise<Record<string, string>>;
  saveLinks(l: Record<string, string>): Promise<void>;
  personLinks(): Promise<PersonLink[]>;
  savePersonLinks(l: PersonLink[]): Promise<void>;
  /** Proposals and the change log are kept, so they survive a restart (DP-04, MC-08). */
  proposals(tripId: string): Promise<Proposal[]>;
  saveProposal(p: Proposal): Promise<void>;
  appendLog(e: LogEntry): Promise<void>;
  log(): Promise<LogEntry[]>;
  /** Push subscriptions per trip (NT-03, NT-05); one endpoint has one row per trip. */
  pushSubs(tripId: string): Promise<PushSub[]>;
  savePushSub(s: PushSub): Promise<void>;
  removePushSubs(tripId: string, match: { endpoint?: string; who?: string }): Promise<void>;
  /** Ticket files (BK-13): an unknown or malformed id gives undefined. */
  file(id: string): Promise<(FileMeta & { bytes: Uint8Array<ArrayBuffer> }) | undefined>;
  saveFile(meta: FileMeta, bytes: Uint8Array): Promise<void>;
  removeFiles(ids: string[]): Promise<void>;
  /** The Commons lookups that all trips share, by normalised title (DB-11). */
  imageCache(): Promise<CacheEntry[]>;
  saveImageCache(e: CacheEntry): Promise<void>;
  removeImageCache(keys: string[]): Promise<void>;
  /** Accounts (US-01) and the owner of each trip that has one (US-13). */
  users(): Promise<User[]>;
  saveUser(u: User): Promise<void>;
  removeUser(id: string): Promise<void>;
  owners(): Promise<Record<string, string>>;
  saveOwner(tripId: string, userId: string | null): Promise<void>;
  /** Feedback and page opens during the beta (US-27, US-28); a page open is kept once per person, page and day. */
  feedback(): Promise<Feedback[]>;
  saveFeedback(f: Feedback): Promise<void>;
  usage(): Promise<Usage[]>;
  saveUsage(u: Usage): Promise<void>;
  /** The AI calls of a month, "YYYY-MM", or of every month without one (AI-03). */
  aiUses(month?: string): Promise<AiUse[]>;
  saveAiUse(u: AiUse): Promise<void>;
  aiHelper(tripId: string, name: string): Promise<AiHelperState | undefined>;
  saveAiHelper(tripId: string, name: string, s: AiHelperState): Promise<void>;
}
/** A Commons lookup: the stored file with its credit and size, or nothing found (DB-11). */
export type CacheEntry = { key: string; at: string; found?: { file: string; page: string; author?: string; licence: string; licenceUrl?: string; size: number } };
/** The form of a ticket file id; checked before any store uses it. */
export const isFileId = (id: string) => /^[a-z0-9]{16,40}$/.test(id);
export type Tokens = { read: string; propose: string; admin: string };
/** Admin login (AU-04): off when no password is set. The session key signs the cookie. */
export type Auth = { adminPassword?: string; sessionKey?: string; google?: Google };
/** owner: a user on a trip they own (US-14); account: a user without the superuser flag, before a trip is chosen. */
type Role = "read" | "propose" | "admin" | "link" | "traveler" | "planner" | "owner" | "account";
const rank: Record<Role, number> = { link: 1, read: 1, traveler: 1, account: 1, propose: 2, planner: 2, owner: 2, admin: 3 };
const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** In-memory store for tests and demos. */
export function memoryStore(trips: unknown[] = [], images: Record<string, Uint8Array<ArrayBuffer>> = {}): Store {
  const m = new Map(trips.map((t) => { const p = Trip.parse(t); return [p.id, p] as const; }));
  let settings = Settings.parse({});
  let links: Record<string, string> = {};
  let people: PersonLink[] = [];
  const proposals = new Map<string, Proposal>(), log: LogEntry[] = [];
  let subs: PushSub[] = [];
  const files = new Map<string, FileMeta & { bytes: Uint8Array<ArrayBuffer> }>();
  const cache = new Map<string, CacheEntry>();
  let users: User[] = [], owners: Record<string, string> = {}, notes: Feedback[] = [], seen: Usage[] = [], ais: AiUse[] = [];
  const helpers = new Map<string, AiHelperState>();
  const sameUse = (a: Usage, b: Usage) => a.tripId === b.tripId && a.who === b.who && a.tab === b.tab && a.day === b.day;
  return {
    feedback: async () => structuredClone(notes),
    saveFeedback: async (f) => { notes = [...notes, structuredClone(f)]; },
    usage: async () => structuredClone(seen),
    saveUsage: async (u) => { if (!seen.some((x) => sameUse(x, u))) seen = [...seen, { ...u }]; },
    aiUses: async (month) => structuredClone(ais.filter((x) => !month || x.month === month)),
    saveAiUse: async (u) => { ais = [...ais, { ...u }]; },
    aiHelper: async (tripId, name) => structuredClone(helpers.get(`${tripId}/${name}`)),
    saveAiHelper: async (tripId, name, x) => void helpers.set(`${tripId}/${name}`, structuredClone(x)),
    users: async () => structuredClone(users).sort((a, b) => a.id.localeCompare(b.id)),
    saveUser: async (u) => { users = [...users.filter((x) => x.id !== u.id), structuredClone(u)]; },
    removeUser: async (id) => { users = users.filter((x) => x.id !== id); },
    owners: async () => ({ ...owners }),
    saveOwner: async (tripId, userId) => { const { [tripId]: _old, ...rest } = owners; owners = userId ? { ...rest, [tripId]: userId } : rest; },
    file: async (id) => { const f = files.get(id); return f && { ...f, bytes: f.bytes.slice() }; },
    saveFile: async (m, bytes) => void files.set(m.id, { ...m, bytes: Uint8Array.from(bytes) }),
    removeFiles: async (ids) => ids.forEach((id) => files.delete(id)),
    imageCache: async () => [...cache.values()],
    saveImageCache: async (e) => void cache.set(e.key, e),
    removeImageCache: async (keys) => keys.forEach((k) => cache.delete(k)),
    pushSubs: async (tripId) => structuredClone(subs.filter((x) => x.tripId === tripId).sort(bySubscriber)),
    savePushSub: async (x) => { subs = [...subs.filter((y) => !(y.tripId === x.tripId && y.endpoint === x.endpoint)), structuredClone(x)]; },
    removePushSubs: async (tripId, m) => { subs = subs.filter((x) => !(x.tripId === tripId && pushMatch(x, m))); },
    links: async () => ({ ...links }),
    saveLinks: async (l) => { links = { ...l }; },
    personLinks: async () => structuredClone(people),
    savePersonLinks: async (l) => { people = structuredClone(l); },
    proposals: async (tripId) => [...proposals.values()].filter((p) => p.tripId === tripId).map((p) => structuredClone(p)),
    saveProposal: async (p) => void proposals.set(p.id, structuredClone(p)),
    appendLog: async (e) => void log.push(structuredClone(e)),
    log: async () => structuredClone(log),
    list: async () => [...m.values()].sort((a, b) => a.id.localeCompare(b.id)).map((t) => structuredClone(t)),
    load: async (id) => (m.has(id) ? structuredClone(m.get(id)) : undefined),
    save: async (t, base) => {
      if (base !== undefined && m.get(t.id)?.revision !== base) return false;
      m.set(t.id, structuredClone(t));
      return true;
    },
    remove: async (id) => m.delete(id),
    image: async (name) => images[name],
    loadSettings: async () => structuredClone(settings),
    saveSettings: async (s) => { settings = structuredClone(s); },
  };
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trip";

/** Compares secrets without stopping at the first difference. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const SESSION_DAYS = 30, MAX_FAILS = 5, FAIL_WINDOW_MS = 15 * 60_000;
/** 144 random bits as base64url (AU-01). */
/** 80 random bits in lowercase letters and digits, for an inbox address (BK-14). */
const inboxSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
const newSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, "-").replace(/\//g, "_");
/** The role a link has in the trip's permissions (AU-20). */
const accessRole = (role: Role): AccessRole | undefined => (role === "link" ? "follower" : role === "traveler" || role === "planner" ? role : undefined);
/** Whether a link's role may make all these changes under the trip's permissions (AU-21, AU-22). Below "write" on expenses,
 * an expense is added one at a time and alone (AU-13). The permissions themselves belong to the superuser. */
function linkMayChange(t: Trip, ar: AccessRole, ops: Op[], travelerId?: string) {
  const rules = accessFor(t, ar);
  const ok = ops.length > 0 && ops.every((o) => {
    if (relinksOwn(t, o, travelerId)) return true; // MI-41
    const n = opNeeds(o);
    return n.part === "access" ? false : n.part === "trip" ? ar === "planner"
      : n.part === "memories" ? atLeast(rules.view.mi.memories ?? "hidden", n.level) : atLeast(rules.parts[n.part], n.level); // MI-21
  });
  const adds = ops.some((o) => o.op === "add" && o.path === "expenses/-");
  return ok && (!adds || rules.parts.expenses === "write" || ops.length === 1);
}
/** A traveler moves an expense they added to another wish or none, with its activity, and confirms its category; nothing else of it (MI-41). */
function relinksOwn(t: Trip, o: Op, travelerId?: string) {
  const m = /^expenses\/(\d+)\/(activityId|dreamId|category)$/.exec(o.path);
  return !!m && !!travelerId && (o.op === "set" || (o.op === "remove" && m[2] !== "category")) && t.expenses[Number(m[1])]?.addedBy === travelerId;
}
type Activity = Trip["days"][number]["activities"][number];
/** Activities hidden from the viewer, without title, note, places or category, and without places only they use (AU-18).
 * A day's title, summary and timeline label that resemble such an activity are emptied too (AU-27), and the legs of its
 * day lose their places, so no route map gives it away (AU-28). Every other text that resembles an activity hidden from the
 * viewer anywhere in the trip, or links a place whose name does, is emptied and its item marked hidden (AU-30). */
function masked<T extends Omit<Trip, "budgetMax">>(t: T, hiddenFor: (a: Activity) => boolean, hides: (who: string[]) => boolean): T {
  if (!t.days.some((d) => d.activities.some(hiddenFor))) return t;
  const mine = secretsOf(t).filter((x) => hides(x.who));
  const place = (id?: string) => t.places.find((x) => x.id === id);
  const gives = (texts: (string | undefined)[], placeId?: string) => whoFor(mine, [...texts, place(placeId)?.name, place(placeId)?.notes]).length > 0;
  const named = new Set(t.places.filter((x) => gives([x.name, x.notes])).map((x) => x.id)); // never sent (AU-30)
  const dayGives = (d: Trip["days"][number], text: string) => d.activities.some((a) => hiddenFor(a) && similarTitles(a.text, text)) || gives([text]);
  const days = t.days.map((d) => ({
    ...d, ...(dayGives(d, d.title) ? { title: "", hiddenTitle: true } : {}), ...(dayGives(d, d.summary) ? { summary: "", hiddenSummary: true } : {}),
    ...(d.activities.some(hiddenFor) ? { legs: d.legs.map(({ origin, destination, waypoints, ...l }) => ({ ...l, origin: "", destination: "", waypoints: [] })), hiddenRoute: true } : {}),
    activities: d.activities.map((a) => (!hiddenFor(a) ? { ...a, placeIds: a.placeIds.filter((id) => !named.has(id)) }
      : { id: a.id, text: "", placeIds: [], start: a.start, end: a.end, estimated: a.estimated, durationMin: a.durationMin, hidden: true })),
  }));
  const stops = t.stops.map((s) => { const d = t.days.find((x) => x.id === s.dayId); return d && dayGives(d, s.label) ? { ...s, label: "" } : s; });
  const budget = t.budget.map(({ note, ...b }) => (gives([b.category, note]) ? { ...b, category: "", hidden: true } : { ...b, ...(note !== undefined ? { note } : {}) }));
  const hiddenIds = new Set(t.days.flatMap((d) => d.activities.filter(hiddenFor).map((a) => a.id)));
  const bookings = t.bookings.map(({ note, placeId, files, ...b }) => (gives([b.name, note], placeId) || (b.activityId && hiddenIds.has(b.activityId)) // BK-11
    ? { ...b, name: "", hidden: true } : { ...b, ...(note !== undefined ? { note } : {}), ...(placeId ? { placeId } : {}), ...(files ? { files } : {}) }));
  const tasks = t.tasks.map(({ placeId, ...k }) => (gives([k.text], placeId) ? { ...k, text: "", hidden: true } : { ...k, ...(placeId ? { placeId } : {}) }));
  const info = t.info.map(({ unsuitable, placeId, ...i }) => (gives([i.title, i.text, unsuitable], placeId) ? { ...i, title: "", text: "", hidden: true }
    : { ...i, ...(unsuitable !== undefined ? { unsuitable } : {}), ...(placeId ? { placeId } : {}) }));
  const expenses = t.expenses.map((e) => (gives([e.text]) ? { ...e, text: "", hidden: true } : e));
  const payments = t.payments.map(({ note, ...x }) => (gives([note]) ? { ...x, hidden: true } : { ...x, ...(note !== undefined ? { note } : {}) }));
  const dreams = t.dreams.map(({ url, image, ...w }) => (gives([w.title, w.source, url]) ? { ...w, title: "", source: "", hidden: true } // DB-10: no link or image either
    : { ...w, ...(url ? { url } : {}), ...(image ? { image } : {}) }));
  // MI-21: kept in place, so that the viewer's own memories keep their positions, but without verdict or comment
  const secretWishes = new Set(dreams.filter((w) => w.hidden).map((w) => w.id));
  const memories = t.memories.map((m) => (secretWishes.has(m.dreamId) ? { id: m.id, dreamId: m.dreamId, by: m.by } : m));
  const trip = { ...(gives([t.purpose]) ? { purpose: "", hiddenPurpose: true } : {}), ...(t.note && gives([t.note]) ? { note: "", hiddenNote: true } : {}) };
  const secret = new Set(t.days.flatMap((d) => d.activities.filter(hiddenFor).flatMap((a) => a.placeIds)));
  const used = new Set([...days.flatMap((d) => d.activities.flatMap((a) => a.placeIds)), ...bookings.map((b) => b.placeId), ...tasks.map((k) => k.placeId), ...info.map((i) => i.placeId)]);
  return { ...t, ...trip, days, stops, budget, bookings, tasks, info, expenses, payments, dreams, memories,
    places: t.places.filter((x) => !named.has(x.id) && (!secret.has(x.id) || used.has(x.id))) } as T;
}
/** The paths where two versions of a trip differ: what the masking changed for the viewer (AU-30). */
function changedPaths(a: unknown, b: unknown, path = ""): string[] {
  if (a === b) return [];
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return [path];
  if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== (b as unknown[]).length)) return [path];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((k) => changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}/${k}` : k));
}
/** True when an operation would change or replace something masked for the viewer; ticking a hidden task is fine (AU-30). */
const touchesMasked = (o: Op, paths: string[]) => !(/^tasks\/\d+\/done$/.test(o.path) && o.op === "set") &&
  paths.some((p) => p === o.path || p.startsWith(`${o.path}/`) || o.path.startsWith(`${p}/`));
/** True when the change approves an expense: one that was unhandled, or is new, and is not unhandled after it (MI-12). */
function approvesExpense(before: Trip, after: Trip) {
  const was = new Map(before.expenses.map((e) => [e.id, !!e.pending]));
  return after.expenses.some((e) => !e.pending && (was.get(e.id) ?? true));
}
/** True when the change hides an activity from the traveler making it, which no one may do (AU-18). */
function hidesFromSelf(before: Trip, after: Trip, travelerId: string) {
  const was = new Map(before.days.flatMap((d) => d.activities).map((a) => [a.id, a.hiddenFrom ?? []]));
  return after.days.flatMap((d) => d.activities).some((a) => a.hiddenFrom?.includes(travelerId) && !was.get(a.id)?.includes(travelerId));
}
/** True when the change adds, changes or removes a memory of another traveler than the one making it (MI-22). */
function othersMemories(before: Trip, after: Trip, travelerId: string) {
  const key = (m: Trip["memories"][number]) => JSON.stringify(m);
  const was = new Set(before.memories.filter((m) => m.by !== travelerId).map(key));
  const now = new Set(after.memories.filter((m) => m.by !== travelerId).map(key));
  return was.size !== now.size || [...was].some((k) => !now.has(k));
}
/** New expenses from a personal link are paid and added by its traveler; null when one names someone else (AU-13). */
function ownExpenses(ops: Op[], travelerId: string): Op[] | null {
  const out: Op[] = [];
  for (const o of ops) {
    if (o.op !== "add" || o.path !== "expenses/-" || typeof o.value !== "object" || o.value === null) { out.push(o); continue; }
    const v = o.value as { paidBy?: unknown; addedBy?: unknown };
    if ((v.paidBy !== undefined && v.paidBy !== travelerId) || (v.addedBy !== undefined && v.addedBy !== travelerId)) return null;
    out.push({ ...o, value: { ...v, paidBy: travelerId, addedBy: travelerId } });
  }
  return out;
}

const withoutInbox = ({ inbox: _inbox, ...t }: Trip): Trip => t;
const withoutWishInbox = ({ wishInbox: _w, ...t }: Trip): Trip => t;
/** The ticket files that bookings use. */
const fileIdsOf = (bookings: Trip["bookings"]) => bookings.flatMap((b) => (b.files ?? []).map((f) => f.id));
/** The image files of wishes; only own photos belong to the trip, Commons files to the shared cache (DB-08, DB-11). */
const wishFiles = (dreams: Trip["dreams"], own = false) => dreams.flatMap((w) => (w.image && (!own || w.image.kind === "own") ? [w.image.file] : []));
/** The owner of the files that the image cache shares between trips (DB-11). */
const COMMONS_FILES = "_commons";
/** The ticket files of a trip's pending proposals, which the reviewer opens before approving (BK-17). */
const proposalFiles = (ps: Proposal[]) => ps.filter((p) => p.status === "pending").flatMap((p) => (p.booking?.files ?? []).map((f) => f.id));
/** The types a ticket may have, each with the first bytes its content starts with (BK-09). */
const MAGIC: Record<TicketFile["type"], number[]> = { "application/pdf": [0x25, 0x50, 0x44, 0x46], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff] };
export const MAX_FILE = 2 * 1024 * 1024;
/** A ticket file's type when its content matches it; undefined otherwise (BK-09, BK-15). */
export const ticketType = (type: string, bytes: Uint8Array): TicketFile["type"] | undefined => {
  const t = type.split(";")[0]!.trim().toLowerCase() as TicketFile["type"];
  return MAGIC[t]?.every((b, i) => bytes[i] === b) ? t : undefined;
};
/** A random id of 80 bits for a stored file. */
export const newFileId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("");
/** Stores a ticket file of a trip and returns what the booking keeps of it. */
export async function storeTicket(store: Store, tripId: string, name: string, type: TicketFile["type"], bytes: Uint8Array): Promise<TicketFile> {
  const id = newFileId();
  await store.saveFile({ id, tripId, type }, bytes);
  return { id, name: name.trim().slice(0, 200) || "biljett", type, size: bytes.length };
}

type Env = { Variables: { role: Role; tripId?: string; travelerId?: string; user?: User } };
/** True when a subscription matches every given field. */
/** The order every store lists subscriptions in. */
export const bySubscriber = (a: PushSub, b: PushSub) => a.who.localeCompare(b.who) || a.endpoint.localeCompare(b.endpoint);
export const pushMatch = (x: PushSub, m: { endpoint?: string; who?: string }) => (!m.endpoint || x.endpoint === m.endpoint) && (!m.who || x.who === m.who);

/** The AI service and the features it runs; tests give their own (AI-65). */
export type AiOpts = { call: AiCall; features?: Record<string, AiFeature> };

/** onChange: told after every saved change of a trip, to start its AI timer (AI-69). */
export function createApp(store: Store, tokens: Tokens, opts: { aiService?: boolean; ai?: AiOpts; onChange?: (tripId: string) => Promise<void>; auth?: Auth; vapidKey?: string; inboxDomain?: string } & TrafficOpts = {}) {
  const app = new Hono<Env>();
  const { adminPassword, sessionKey, google } = opts.auth ?? {};
  const fails = new Map<string, { n: number; since: number }>(); // per address and per account, in memory (AU-05, US-08)
  const clock = () => opts.now?.() ?? new Date();
  const ipOf = (c: Context<Env>) => c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local";
  const blocked = (key: string) => {
    const f = fails.get(key), now = Date.now();
    if (f && now - f.since > FAIL_WINDOW_MS) fails.delete(key);
    return (fails.get(key)?.n ?? 0) >= MAX_FAILS;
  };
  const failed = (key: string) => { const g = fails.get(key) ?? { n: 0, since: Date.now() }; fails.set(key, { ...g, n: g.n + 1 }); };
  /** The session cookie: `admin.<exp>` for the admin password, `user.<id>.<exp>` for an account (AU-04, US-11). */
  const startSession = async (c: Context<Env>, who: string, strict = true) => {
    const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
    await setSignedCookie(c, "session", `${who}.${exp}`, sessionKey!, { httpOnly: true, secure: true, sameSite: strict ? "Strict" : "Lax", path: "/api", maxAge: SESSION_DAYS * 86400 });
  };
  const loggedIn = (u: User) => store.saveUser({ ...u, lastLogin: clock().toISOString() });

  // AU-04, AU-05: admin login with a password; US-07, US-08: an account logs in with its address and password.
  app.post("/api/login", async (c) => {
    const b = await c.req.json<{ email?: unknown; password?: unknown }>().catch(() => ({} as { email?: unknown; password?: unknown }));
    const ip = ipOf(c);
    if (typeof b.email === "string" && b.email.trim()) {
      if (!sessionKey) return c.json({ error: "login is off" }, 404);
      const email = normEmail(b.email), acct = `account:${email}`;
      if (blocked(ip) || blocked(acct)) return c.json({ error: "too many attempts" }, 429);
      const u = (await store.users()).find((x) => x.email === email && !x.disabled);
      const ok = !!u?.passwordHash && typeof b.password === "string" && await checkPassword(b.password, u.passwordHash);
      if (!ok) { failed(ip); failed(acct); return c.json({ error: "wrong address or password" }, 401); } // the same answer either way (US-07)
      fails.delete(ip); fails.delete(acct);
      await loggedIn(u!);
      await startSession(c, `user.${u!.id}`);
      return c.body(null, 204);
    }
    if (!adminPassword || !sessionKey) return c.json({ error: "login is off" }, 404);
    if (blocked(ip)) return c.json({ error: "too many attempts" }, 429);
    if (typeof b.password !== "string" || !same(b.password, adminPassword)) {
      failed(ip);
      return c.json({ error: "wrong password" }, 401);
    }
    fails.delete(ip);
    await startSession(c, "admin");
    return c.body(null, 204);
  });
  app.post("/api/logout", (c) => { deleteCookie(c, "session", { path: "/api", secure: true }); return c.body(null, 204); });

  // US-04, US-05: the password link shows whose account it is, and sets the password once.
  const setupUser = async (c: Context<Env>) => {
    const b = await c.req.json<{ user?: unknown; secret?: unknown; password?: unknown; consent?: unknown }>().catch(() => ({} as { user?: unknown; secret?: unknown; password?: unknown; consent?: unknown }));
    const u = (await store.users()).find((x) => x.id === b.user);
    const valid = !!u?.setup && !u.disabled && typeof b.secret === "string" && same(await sha256(b.secret), u.setup.hash) && Date.parse(u.setup.expires) > clock().getTime();
    return { u: valid ? u : undefined, password: b.password, consent: b.consent === true };
  };
  app.post("/api/setup/info", async (c) => {
    const { u } = await setupUser(c);
    return u ? c.json({ name: u.name, email: u.email }) : c.json({ error: "gone" }, 410);
  });
  app.post("/api/setup", async (c) => {
    if (!sessionKey) return c.json({ error: "login is off" }, 404);
    const { u, password, consent } = await setupUser(c);
    if (!u) return c.json({ error: "gone" }, 410);
    if (typeof password !== "string" || [...password].length < PASSWORD_MIN) return c.json({ error: "too short" }, 400);
    const { setup: _used, ...rest } = u;
    await store.saveUser({ ...rest, passwordHash: await hashPassword(password), lastLogin: clock().toISOString(), ...(consent ? { consentAt: clock().toISOString() } : {}) }); // US-26
    await startSession(c, `user.${u.id}`);
    return c.body(null, 204);
  });

  // US-09, US-10: Google login, only for an existing account with Google's verified address.
  app.get("/api/auth/config", (c) => c.json({ google: !!google && !!sessionKey }));
  const redirectUri = (c: Context<Env>) => `${new URL(c.req.url).origin}/api/auth/google/callback`;
  app.get("/api/auth/google", async (c) => {
    if (!google || !sessionKey) return c.json({ error: "off" }, 404);
    const state = newSecret(), { verifier, challenge } = await pkce();
    await setSignedCookie(c, "google", `${state}.${verifier}`, sessionKey, { httpOnly: true, secure: true, sameSite: "Lax", path: "/api/auth", maxAge: 600 });
    return c.redirect(googleAuthUrl(google, redirectUri(c), state, challenge), 302);
  });
  app.get("/api/auth/google/callback", async (c) => {
    if (!google || !sessionKey) return c.json({ error: "off" }, 404);
    const kept = await getSignedCookie(c, sessionKey, "google");
    deleteCookie(c, "google", { path: "/api/auth", secure: true });
    const [state, verifier] = (kept || "").split(".");
    const code = c.req.query("code");
    if (!state || !verifier || !code || !same(state, c.req.query("state") ?? "")) return c.redirect("/#login=fel", 302);
    const id = await googleIdentity(google, code, verifier, redirectUri(c), opts.fetch, clock().getTime());
    if (!id?.verified) return c.redirect("/#login=fel", 302);
    const users = await store.users();
    const u = users.find((x) => x.googleId === id.sub) ?? users.find((x) => x.email === id.email && !x.googleId);
    if (!u || u.disabled) return c.redirect("/#login=nokonto", 302);
    await loggedIn({ ...u, googleId: id.sub });
    await startSession(c, `user.${u.id}`);
    return c.redirect("/", 302);
  });

  // Who is calling: an admin or account session, an MCP token, the common share link or a personal link (AU-01, AU-04, AU-09, AU-11, US-11).
  app.use("/api/*", async (c, next) => {
    if (sessionKey) {
      const v = await getSignedCookie(c, sessionKey, "session");
      const [kind, a, b] = v ? v.split(".") : [];
      if (kind === "admin" && Number(a) * 1000 > Date.now()) { c.set("role", "admin"); return next(); }
      if (kind === "user" && Number(b) * 1000 > Date.now()) {
        const u = (await store.users()).find((x) => x.id === a); // checked on every request, so a disabled account is out at once
        if (u && !u.disabled) { c.set("user", u); c.set("role", u.superuser ? "admin" : "account"); return next(); }
      }
    }
    const t = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
    const role = (Object.keys(tokens) as (keyof Tokens)[]).find((r) => tokens[r] && same(tokens[r], t));
    if (role) { c.set("role", role); return next(); }
    const m = /^link\.([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(t);
    const secret = m ? (await store.links())[m[1]] : undefined;
    if (m && secret && same(secret, m[2])) { c.set("role", "link"); c.set("tripId", m[1]); return next(); }
    const p = /^person\.([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(t); // AU-11
    const l = p ? (await store.personLinks()).find((x) => x.tripId === p[1] && x.travelerId === p[2]) : undefined;
    if (p && l && same(l.secret, p[3]) && (await store.load(l.tripId))?.travelers.some((x) => x.id === l.travelerId)) {
      c.set("role", l.role); c.set("tripId", l.tripId); c.set("travelerId", l.travelerId);
      return next();
    }
    return c.json({ error: "unauthorized" }, 401);
  });
  /** A user's roles in every trip they reach (US-13, US-14, US-22). */
  const membersOf = async (u: User, trips?: Trip[]) =>
    memberships(u, await store.users(), trips ?? await store.list(), await store.owners(), await store.personLinks());
  // US-14, US-22: on a trip, a user gets the role they have there; a trip they do not reach does not exist for them.
  const tripRole = async (c: Context<Env>, next: () => Promise<void>) => {
    const u = c.get("user"), id = c.req.param("id");
    if (!u || !id || c.get("tripId")) return next();
    const t = await store.load(id);
    const m = t && (await membersOf(u, [t]))[id];
    if (!m) return c.json({ error: "not found" }, 404);
    c.set("role", m.role); c.set("tripId", id);
    if (m.role === "traveler" || m.role === "planner") c.set("travelerId", m.travelerId);
    return next();
  };
  app.use("/api/trips/:id/*", tripRole);
  app.use("/api/trips/:id", tripRole);
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
    const { budgetMax, access: _all, wishInbox: _w, ...rest } = ar === "planner" ? t : withoutInbox(t); // the address: BK-26, below
    const own = t.access?.[ar]; // the role's own choices, so the app shows the same as the server sends
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

  app.get("/api/me", async (c) => {
    const u = c.get("user");
    if (u) return c.json({ role: c.get("role"), user: { id: u.id, name: u.name, superuser: u.superuser }, trips: await membersOf(u), consent: !!u.consentAt }); // US-22, US-23, US-26
    return c.json(!scoped(c) ? { role: c.get("role") }
      : { role: c.get("role"), tripId: c.get("tripId"), ...(c.get("travelerId") ? { travelerId: c.get("travelerId") } : {}) });
  });
  // A link sees one trip only; other trips do not exist for it (AU-03, AU-12, AU-14).
  app.use("/api/trips/:id/*", async (c, next) => (scoped(c) && c.req.param("id") !== c.get("tripId") ? c.json({ error: "not found" }, 404) : next()));
  app.use("/api/trips/:id", async (c, next) => (scoped(c) && c.req.param("id") !== c.get("tripId") ? c.json({ error: "not found" }, 404) : next()));
  app.use("/api/settings", async (c, next) => (scoped(c) ? c.json({ error: "forbidden" }, 403) : next()));

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

  app.get("/api/trips", async (c) => {
    const all = await store.list(), u = c.get("user");
    if (u) { // US-14, US-15, US-22: a user's own trips and the ones they travel on, each seen with the role they have there
      const m = await membersOf(u, all);
      return c.json(all.filter((t) => m[t.id]).map((t) => view(t, m[t.id]!.role, m[t.id]!.role === "traveler" || m[t.id]!.role === "planner" ? m[t.id]!.travelerId : undefined)));
    }
    return c.json(all.filter((t) => !scoped(c) || t.id === c.get("tripId")).map((t) => view(t, c.get("role"), c.get("travelerId"))));
  });
  app.post("/api/trips", async (c) => {
    if (!need(c, "admin") && c.get("role") !== "account") return c.json({ error: "forbidden" }, 403); // US-14: every user creates trips
    const b = await c.req.json<{ title?: string; purpose?: string }>().catch(() => ({ title: undefined, purpose: undefined }));
    const title = b.title?.trim();
    if (!title) return c.json({ error: "title required" }, 400);
    const trip = Trip.parse({
      id: `${slug(title)}-${crypto.randomUUID().slice(0, 6)}`, revision: 1, title, purpose: b.purpose ?? "", timezone: "Europe/Stockholm",
      stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [],
    });
    await store.save(trip);
    const owner = c.get("user")?.id ?? (c.get("role") === "admin" ? firstSuper(await store.users())?.id : undefined); // US-13, US-18
    if (owner) await store.saveOwner(trip.id, owner);
    await store.appendLog({ at: new Date().toISOString(), tripId: trip.id, actor: c.get("user")?.name ?? "user", reason: "create", ops: [] });
    return c.json(trip, 201);
  });
  app.get("/api/settings", async (c) => { // AI-08; US-16: the AI service only for users allowed it
    const u = c.get("user");
    return c.json({ ...(await store.loadSettings()), aiService: !!opts.aiService && (!u || u.superuser || u.ai) });
  });
  app.put("/api/settings", async (c) => {
    if (!need(c, "admin")) return c.json({ error: "forbidden" }, 403); // AI-09
    const parsed = Settings.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ ok: false, problems: describeError(parsed.error) }, 422);
    await store.saveSettings(parsed.data);
    return c.json(parsed.data);
  });
  app.get("/api/log", async (c) => (need(c, "admin") ? c.json(await store.log()) : c.json({ error: "forbidden" }, 403)));

  // Every route below works on one trip, which must exist.
  app.use("/api/trips/:id/*", async (c, next) => ((await store.load(c.req.param("id"))) ? next() : c.json({ error: "not found" }, 404)));
  const load = async (id: string) => (await store.load(id))!;

  app.get("/api/trips/:id", async (c) => {
    const t = await store.load(c.req.param("id"));
    return t ? c.json(view(t, c.get("role"), c.get("travelerId"))) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/trips/:id", async (c) => {
    if (!full(c)) return c.json({ error: "forbidden" }, 403); // MC-07; US-14: the owner deletes their own trip
    if (!(await store.remove(c.req.param("id")))) return c.json({ error: "not found" }, 404);
    await store.saveOwner(c.req.param("id"), null);
    const { [c.req.param("id")]: _gone, ...links } = await store.links();
    await store.saveLinks(links); // a deleted trip's links must not come back with a new trip of the same id
    await store.savePersonLinks((await store.personLinks()).filter((l) => l.tripId !== c.req.param("id")));
    await store.appendLog({ at: new Date().toISOString(), tripId: c.req.param("id"), actor: c.get("user")?.name ?? "user", reason: "delete", ops: [] });
    return c.body(null, 204);
  });
  app.get("/api/trips/:id/image", async (c) => {
    const name = (await load(c.req.param("id"))).image;
    const bytes = name ? await store.image(name) : undefined;
    if (!name || !bytes) return c.json({ error: "not found" }, 404);
    // MT-12: an image replaced under the same name must show at once, so the browser revalidates with an ETag of the content.
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
    const etag = `"${[...hash].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
    const headers = { etag, "cache-control": "private, no-cache" };
    if (c.req.header("if-none-match") === etag) return c.body(null, 304, headers);
    return c.body(bytes, 200, { ...headers, "content-type": mime[name.split(".").pop()!] });
  });
  app.get("/api/trips/:id/days/:dayId/traffic", async (c) => {
    const t = view(await load(c.req.param("id")), c.get("role"), c.get("travelerId")); // a hidden route is not checked (AU-28)
    const day = t.days.find((d) => d.id === c.req.param("dayId"));
    return day ? c.json(await checkTraffic(t, day, opts)) : c.json({ error: "not found" }, 404);
  });
  app.get("/api/trips/:id/check", async (c) => c.json({ problems: checkTrip(await load(c.req.param("id"))) }));
  app.get("/api/trips/:id/proposals", async (c) => (["link", "traveler"].includes(c.get("role")) ? c.json({ error: "forbidden" }, 403) : c.json(await store.proposals(c.req.param("id")))));

  // AU-06: the admin creates, reads and replaces a trip's share link; replacing it stops the old one at once.
  app.get("/api/trips/:id/link", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const secret = (await store.links())[c.req.param("id")];
    return secret ? c.json({ secret }) : c.json({ error: "no link" }, 404);
  });
  app.post("/api/trips/:id/link", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const secret = newSecret();
    await store.saveLinks({ ...(await store.links()), [c.req.param("id")]: secret });
    await store.removePushSubs(c.req.param("id"), { who: "follower" }); // the old link's phones (NT-05)
    return c.json({ secret }, 201);
  });

  // AU-11: personal links per traveler, managed by the superuser or a Planerare of the trip.
  const people = async (tripId: string) => (await store.personLinks()).filter((l) => l.tripId === tripId);
  const shown = (l: PersonLink) => ({ travelerId: l.travelerId, role: l.role, secret: l.secret, ...(l.account ? { account: l.account } : {}) });
  app.get("/api/trips/:id/people", async (c) => (manager(c) ? c.json((await people(c.req.param("id"))).map(shown)) : c.json({ error: "forbidden" }, 403)));
  app.put("/api/trips/:id/people/:tid", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const tripId = c.req.param("id"), travelerId = c.req.param("tid");
    const { role, account } = await c.req.json<{ role?: string; account?: unknown }>().catch(() => ({ role: undefined, account: undefined }));
    if (role !== "traveler" && role !== "planner") return c.json({ error: "role must be traveler or planner" }, 400);
    if (!(await load(tripId)).travelers.some((x) => x.id === travelerId)) return c.json({ error: "not found" }, 404);
    const all = await store.personLinks(), old = all.find((l) => l.tripId === tripId && l.travelerId === travelerId);
    // US-21: the traveler's account address; left out keeps it, null or empty clears it. Nothing tells whether an account has it.
    const address = account === undefined ? old?.account : typeof account === "string" && account.trim() ? normEmail(account) : account === null || account === "" ? undefined : false;
    if (address === false || (address && !validEmail(address))) return c.json({ error: "bad address" }, 400);
    if (address && all.some((l) => l.tripId === tripId && l.travelerId !== travelerId && l.account === address)) return c.json({ error: "address in use" }, 409);
    const next: PersonLink = { tripId, travelerId, role, secret: old?.secret ?? newSecret(), ...(address ? { account: address } : {}) }; // a new permission keeps the link
    await store.savePersonLinks([...all.filter((l) => l !== old), next]);
    return c.json(shown(next), old ? 200 : 201);
  });
  app.post("/api/trips/:id/people/:tid/renew", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const all = await store.personLinks(), old = all.find((l) => l.tripId === c.req.param("id") && l.travelerId === c.req.param("tid"));
    if (!old) return c.json({ error: "not found" }, 404);
    const next = { ...old, secret: newSecret() }; // the old link stops working at once
    await store.savePersonLinks([...all.filter((l) => l !== old), next]);
    await store.removePushSubs(old.tripId, { who: old.travelerId }); // NT-05
    return c.json(shown(next));
  });
  app.delete("/api/trips/:id/people/:tid", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const all = await store.personLinks(), rest = all.filter((l) => !(l.tripId === c.req.param("id") && l.travelerId === c.req.param("tid")));
    if (rest.length === all.length) return c.json({ error: "not found" }, 404);
    await store.savePersonLinks(rest);
    await store.removePushSubs(c.req.param("id"), { who: c.req.param("tid") }); // NT-05
    return c.body(null, 204);
  });

  // NT-03, NT-05: the public key to subscribe with, and each phone's subscription per trip.
  app.get("/api/push/key", async (c) => (opts.vapidKey ? c.json({ key: await vapidPublicKey(opts.vapidKey) }) : c.json({ error: "off" }, 404)));
  app.put("/api/trips/:id/push", async (c) => {
    if (c.get("role") === "read" || c.get("role") === "propose") return c.json({ error: "forbidden" }, 403); // a token is no person
    const b = await c.req.json<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }>().catch(() => ({} as never));
    const ok = typeof b.endpoint === "string" && /^https:\/\//.test(b.endpoint) && typeof b.keys?.p256dh === "string" && typeof b.keys?.auth === "string";
    if (!ok) return c.json({ error: "endpoint and keys needed" }, 400);
    await store.savePushSub({ tripId: c.req.param("id"), who: whoOf(c), endpoint: b.endpoint as string, p256dh: b.keys!.p256dh as string, auth: b.keys!.auth as string });
    return c.body(null, 204);
  });
  app.delete("/api/trips/:id/push", async (c) => {
    const b = await c.req.json<{ endpoint?: unknown }>().catch(() => ({} as never));
    if (typeof b.endpoint !== "string") return c.json({ error: "endpoint needed" }, 400);
    await store.removePushSubs(c.req.param("id"), { endpoint: b.endpoint, who: whoOf(c) });
    return c.body(null, 204);
  });

  // BK-09: a Planerare or the superuser uploads a ticket file; the booking that uses it is saved as a normal change.
  app.post("/api/trips/:id/files", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > MAX_FILE) return c.json({ error: "too large" }, 413);
    const type = ticketType(c.req.header("content-type") ?? "", bytes);
    if (!type || !bytes.length) return c.json({ error: "PDF, PNG or JPEG only" }, 415);
    return c.json(await storeTicket(store, c.req.param("id"), c.req.query("name") ?? "", type, bytes), 201);
  });
  // BK-11: a file only for those who get its booking with the reference, and for managers while a proposal holds it.
  app.get("/api/trips/:id/files/:fid", async (c) => {
    const id = c.req.param("fid"), t = await load(c.req.param("id"));
    const shown = view(t, c.get("role"), c.get("travelerId"));
    const seen = fileIdsOf(shown.bookings).includes(id) || wishFiles(shown.dreams).includes(id) // DB-10
      || (manager(c) && proposalFiles(await store.proposals(t.id)).includes(id));
    const f = seen ? await store.file(id) : undefined;
    if (!f || (f.tripId !== t.id && f.tripId !== COMMONS_FILES)) return c.json({ error: "not found" }, 404); // a cached file serves every trip that uses it (DB-11)
    return c.body(f.bytes, 200, { "content-type": f.type, "cache-control": "private, max-age=31536000, immutable" }); // a file never changes under its id
  });
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
  /** BK-26: who may have the trip's address: those who manage it, and a Resenär whose role sees wishes. */
  const mayMail = (c: Context<Env>, t: Trip) => manager(c) || (c.get("role") === "traveler" && accessFor(t, "traveler").parts.dreams !== "hidden");
  const newAddress = () => `inkorg-${inboxSecret()}@${opts.inboxDomain}`.toLowerCase();
  // BK-27: whether mail import is set up, for those who may have the address, so the app shows its mail buttons; nothing is made here.
  app.get("/api/trips/:id/inbox", async (c) => {
    const t = await load(c.req.param("id"));
    if (!mayMail(c, t)) return c.json({ error: "forbidden" }, 403);
    return c.json(opts.inboxDomain ? { enabled: true, ...(t.inbox ? { address: t.inbox } : {}) } : { enabled: false });
  });
  // BK-26: the trip's one address, made the first time someone who may have it asks for it.
  app.post("/api/trips/:id/inbox", async (c) => {
    const t = await load(c.req.param("id"));
    if (!mayMail(c, t)) return c.json({ error: "forbidden" }, 403);
    if (!opts.inboxDomain) return c.json({ error: "mail import is off" }, 404);
    if (t.inbox) return c.json({ address: t.inbox });
    const address = newAddress(), r = await apply(t, [{ op: "set", path: "inbox", value: address }], actorName(c, t), "trip address");
    return "revision" in r ? c.json({ address }) : c.json({ address: (await load(t.id)).inbox ?? null }, "conflict" in r ? 409 : 422);
  });
  // BK-26: a new address replaces the old at once, and any earlier wish address with it.
  app.post("/api/trips/:id/inbox/replace", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    if (!opts.inboxDomain) return c.json({ error: "mail import is off" }, 404);
    const t = await load(c.req.param("id")), address = newAddress();
    const ops: Op[] = [{ op: "set", path: "inbox", value: address }, ...(t.wishInbox ? [{ op: "remove" as const, path: "wishInbox" }] : [])];
    const r = await apply(t, ops, actorName(c, t), "new trip address");
    return "revision" in r ? c.json({ address }) : c.json({ error: "conflict" }, 409);
  });
  // BK-15, BK-28: on the Node server a manager posts a raw message, sorted like mail through the Worker's email handler.
  app.post("/api/trips/:id/mail", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const r = await sortMail(store, await load(c.req.param("id")), new Uint8Array(await c.req.arrayBuffer()));
    return "proposalId" in r ? c.json(r, 202) : "wishId" in r ? c.json(r, 201) : c.json(r, r.error === "too many" ? 429 : 422);
  });
  // BK-29: a mail proposal becomes the wish DB-23 would have made, with the first attached photo; its other files go.
  app.post("/api/trips/:id/proposals/:pid/wish", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const p = (await store.proposals(c.req.param("id"))).find((x) => x.id === c.req.param("pid") && x.status === "pending" && x.source?.kind === "mail");
    if (!p) return c.json({ error: "not found" }, 404);
    const files = p.booking?.files ?? [], t = await load(p.tripId);
    const photo = files.find((f) => (f.type === "image/png" || f.type === "image/jpeg") && f.size >= MIN_PHOTO && f.size <= IMAGE_MAX);
    const w = p.wish ?? { category: "Aktivitet", source: "Mejl" };
    const title = w.title || (p.source?.kind === "mail" && p.source.subject) || w.url;
    if (!title) return c.json({ error: "no title" }, 422);
    p.status = "approved";
    await store.saveProposal(p);
    const r = await addWish(store, t, { ...w, title }, photo?.id, actorName(c, t));
    if ("error" in r) { p.status = "pending"; await store.saveProposal(p); return c.json(r, 422); }
    await store.removeFiles(files.map((f) => f.id).filter((id) => id !== photo?.id));
    return c.json(r, 201);
  });

  app.post("/api/trips/:id/changes", async (c) => {
    const b = await c.req.json<{ baseRevision: number; ops: Op[]; reason?: string; dryRun?: boolean }>();
    const role = c.get("role"), travelerId = c.get("travelerId"), ar = accessRole(role);
    const t = await load(c.req.param("id"));
    if (!(ar ? linkMayChange(t, ar, b.ops, travelerId) : need(c, "propose"))) return c.json({ error: "forbidden" }, 403); // MC-10, AU-21
    if (role === "owner" && b.ops.some((o) => opNeeds(o).part === "access")) return c.json({ error: "forbidden" }, 403); // AU-22: the permissions are the superuser's
    if (travelerId) { // AU-13: a personal link adds expenses only in its own name
      const own = ownExpenses(b.ops, travelerId);
      if (!own) return c.json({ error: "forbidden" }, 403);
      b.ops = own;
    }
    if (ar === "traveler") b.ops = b.ops.map((o) => (o.op === "add" && o.path === "expenses/-" ? { ...o, value: { ...(o.value as object), pending: true } } : o)); // MI-09
    // Expenses only add to the list, so they go onto the latest revision (PW-08), and one already recorded is not added again (PW-07).
    const onlyExpenses = b.ops.length > 0 && b.ops.every((o) => o.op === "add" && o.path === "expenses/-");
    if (onlyExpenses) {
      b.ops = b.ops.filter((o) => !t.expenses.some((e) => e.id === (o.value as { id?: unknown })?.id));
      if (!b.ops.length) return c.json({ ok: true, revision: t.revision });
    } else if (b.baseRevision !== t.revision) return c.json({ error: "conflict", revision: t.revision }, 409); // MC-05
    let problems: string[], next: Trip;
    try {
      next = Trip.parse(applyOps(t, b.ops));
      problems = checkTrip(next);
      if (!ar && !full(c)) problems.push(...pinBreaks(t, next).map(sv.proposal.pin)); // MC-20: an LLM client leaves pins alone, also in a dry run
    } catch (e) {
      return c.json({ ok: false, problems: describeError(e) }, 422); // MC-03
    }
    if (travelerId && hidesFromSelf(t, next, travelerId)) return c.json({ error: "forbidden" }, 403); // AU-18
    if (travelerId && othersMemories(t, next, travelerId)) return c.json({ error: "forbidden" }, 403); // MI-22
    if (ar === "traveler" && approvesExpense(t, next)) return c.json({ error: "forbidden" }, 403); // MI-12
    const hidden = ar && ar !== "planner" ? changedPaths(view(t, c.get("role"), travelerId, false), view(t, c.get("role"), travelerId)) : [];
    if (b.ops.some((o) => touchesMasked(o, hidden))) return c.json({ error: "forbidden" }, 403); // AU-30: no overwriting what one cannot see
    const summary = b.ops.map((o) => `${o.op} ${o.path}`);
    if (b.dryRun) return c.json({ ok: problems.length === 0, problems, summary }); // MC-04
    if (problems.length) return c.json({ ok: false, problems }, 422);
    const done = (r: Awaited<ReturnType<typeof apply>>) => ("conflict" in r ? c.json({ error: "conflict" }, 409) : c.json(r));
    // Personal links apply at once, logged with the traveler's name (AU-12, AU-14, AU-15).
    if (ar) return done(await apply(t, b.ops, travelerId ? t.travelers.find((x) => x.id === travelerId)?.name ?? travelerId : "link", b.reason ?? "", { c, who: whoOf(c) }));
    if (!full(c)) {
      const p: Proposal = { id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: b.ops, reason: b.reason ?? "", status: "pending", at: new Date().toISOString() };
      await store.saveProposal(p); // MC-06, MC-07: only an admin applies or approves
      return c.json({ proposalId: p.id, status: p.status }, 202);
    }
    return done(await apply(t, b.ops, actorName(c, t), b.reason ?? "", { c, who: whoOf(c) }));
  });

  app.post("/api/trips/:id/proposals/:pid/:action", async (c) => {
    if (!manager(c)) return c.json({ error: "forbidden" }, 403);
    const p = (await store.proposals(c.req.param("id"))).find((x) => x.id === c.req.param("pid") && x.status === "pending");
    if (!p) return c.json({ error: "not found" }, 404);
    if (c.req.param("action") === "reject") {
      p.status = "rejected";
      await store.saveProposal(p);
      const used = new Set(fileIdsOf((await load(p.tripId)).bookings));
      await store.removeFiles((p.booking?.files ?? []).map((f) => f.id).filter((id) => !used.has(id))); // BK-17
      return c.json(p);
    }
    if (p.source?.kind === "mail") { // BK-17: approved with the booking as the reviewer edited it
      const b = await c.req.json<{ baseRevision?: number; ops?: Op[] }>().catch(() => ({} as { baseRevision?: number; ops?: Op[] }));
      if (!Array.isArray(b.ops) || typeof b.baseRevision !== "number") return c.json({ error: "the edited booking is needed" }, 400);
      const t = await load(p.tripId);
      if (t.revision !== b.baseRevision) return c.json({ error: "conflict", revision: t.revision }, 409);
      p.status = "approved"; // first, so apply keeps the files the booking now uses and no longer counts the proposal
      await store.saveProposal(p);
      let r: Awaited<ReturnType<typeof apply>>;
      try { r = await apply(t, b.ops, actorName(c, t), `mail: ${p.source.subject}`, { c, who: whoOf(c) }); } catch (e) { r = { problems: describeError(e) }; }
      if (!("revision" in r)) { p.status = "pending"; await store.saveProposal(p); }
      else { // files the reviewer left out of the booking go too
        const used = new Set(fileIdsOf((await load(p.tripId)).bookings));
        await store.removeFiles((p.booking?.files ?? []).map((f) => f.id).filter((id) => !used.has(id)));
      }
      return "conflict" in r ? c.json({ error: "conflict" }, 409) : "problems" in r ? c.json({ ok: false, problems: r.problems }, 422) : c.json({ proposal: p, result: r });
    }
    const t = await load(p.tripId);
    const item = p.source?.kind === "ai" && p.source.item; // AI-70: one added suggestion goes onto the trip as it is now
    if (t.revision !== p.baseRevision && !item) return c.json({ error: "conflict", revision: t.revision }, 409);
    let ops = p.ops;
    if (p.source?.kind === "ai" && p.source.day) {
      const on = onItsDay(t, p);
      if (!on) { p.status = "rejected"; await store.saveProposal(p); return c.json({ error: "day gone", problems: ["day gone"] }, 409); }
      ops = on;
    }
    const r = await apply(t, ops, p.source?.kind === "ai" ? "ai" : "llm", p.reason, { c, who: "admin" });
    if ("conflict" in r) return c.json({ error: "conflict" }, 409);
    if ("revision" in r) { p.status = "approved"; await store.saveProposal(p); }
    return c.json({ proposal: p, result: r });
  });
  /** AI-77: a suggestion's activity goes onto its day wherever that day is now, in the order of start times; undefined when the day is gone. */
  const onItsDay = (t: Trip, p: Proposal) => {
    const day = p.source?.kind === "ai" ? p.source.day : undefined, i = day ? t.days.findIndex((d) => d.id === day) : -1;
    if (!day) return p.ops;
    if (i < 0) return undefined;
    return p.ops.map((o) => {
      if (!/^days\/\d+\/activities\/-$/.test(o.path)) return { ...o, path: o.path.replace(/^days\/\d+\//, `days/${i}/`) };
      const start = (o.value as { start?: string }).start, at = start ? t.days[i]!.activities.findIndex((a) => !!a.start && a.start > start) : -1;
      return { ...o, path: `days/${i}/activities/${at < 0 ? "-" : at}` }; // before the first that starts later
    });
  };

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
  const capReached = (s: Settings, uses: AiUse[], who: string) => (spent(uses) >= (s.ai.capUsd ?? CAP_USD) ? "instance"
    : spent(uses.filter((x) => x.who === who)) >= (s.ai.capAccountUsd ?? CAP_ACCOUNT_USD) ? "account" : undefined);
  /** About how many more runs of a feature a person has this month (AI-72). */
  const runsLeft = (s: Settings, uses: AiUse[], all: AiUse[], who: string, name: string) => {
    const left = Math.min((s.ai.capUsd ?? CAP_USD) - spent(uses), (s.ai.capAccountUsd ?? CAP_ACCOUNT_USD) - spent(uses.filter((x) => x.who === who)));
    const last = all.filter((x) => x.feature === name && x.usd > 0).slice(-10);
    return Math.max(0, Math.floor(left / (last.length ? spent(last) / last.length : AI_RUN_ESTIMATE_USD) + 1e-9));
  };
  /** Runs one feature for a person and stores the result as proposals: one per suggestion for a helper (AI-01, AI-65, AI-70). */
  async function runFeature(t: Trip, name: string, f: AiFeature, who: string, actor: string) {
    const s = await store.loadSettings(), now = clock(), at = now.toISOString(), month = at.slice(0, 7);
    const h = f.helper, fingerprint = h ? await sha256(h.fingerprint(t)) : undefined;
    const cap = capReached(s, await store.aiUses(month), who);
    if (cap) {
      if (h) await store.saveAiHelper(t.id, name, { at, result: "cap" });
      return { error: "cap" as const, scope: cap };
    }
    const own = h ? (await store.proposals(t.id)).filter((p) => p.source?.kind === "ai" && p.source.feature === name && p.status !== "approved") : [];
    const avoid = h ? [...h.known(t), ...own.flatMap((p) => p.ops.map(h.textOf))] : [];
    let r: AiResult;
    try { r = await runAi(opts.ai!.call, f, t, avoid, at.slice(0, 10)); } catch (e) {
      console.error(`AI ${name} on ${t.id} failed:`, e instanceof Error ? e.message : e); // shows in the Worker's logs
      r = { error: "failed", cost: NO_COST };
    }
    const ops = "error" in r ? [] : r.ops;
    let groups: Op[][] = ops.length ? [ops] : [];
    if (h) { // AI-70: nothing the trip has or the travelers rejected, each suggestion with ids of its own; AI-77: a wish and its activity together
      const taken = new Set([...allIds(t), ...own.flatMap((p) => p.ops.map((o) => String((o.value as { id?: unknown })?.id)))]);
      const textOf = (g: Op[]) => h.textOf(g[0]!);
      groups = (h.group ?? ((xs: Op[]) => xs.map((o) => [o])))(ops.map(h.finish), t)
        .filter((g, i, all) => !avoid.some((x) => sameSuggestion(x, textOf(g))) && all.findIndex((y) => sameSuggestion(textOf(y), textOf(g))) === i)
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
    const source = { kind: "ai" as const, feature: name, by: actor, at, ...(h ? { item: true } : {}) };
    const dayOf = (g: Op[]) => { const m = h && g.map((o) => /^days\/(\d+)\//.exec(o.path)).find(Boolean); return m ? t.days[Number(m[1])]?.id : undefined; }; // AI-77
    const proposals: Proposal[] = groups.map((x) => ({
      id: crypto.randomUUID(), tripId: t.id, baseRevision: t.revision, ops: x, reason: r.reason, status: "pending", at,
      source: { ...source, ...(dayOf(x) ? { day: dayOf(x) } : {}) } }));
    for (const p of proposals) await store.saveProposal(p);
    return { proposalIds: proposals.map((p) => p.id), reason: r.reason };
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
  /** A trip with nothing in it yet but its title and purpose, which an AI draft may fill at once (AI-78). */
  const isEmptyTrip = (t: Trip) => [t.travelers, t.days, t.stops, t.bookings, t.tasks, t.dreams, t.expenses, t.places].every((x) => !x.length);
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
      const applied = { activities: 0, tasks: 0, bookings: 0, wishes: 0, info: 0 }, actor = `ai (${actorName(c, t)})`;
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
        }
      }
      const { info, ...rest } = applied;
      return c.json({ applied: { ...rest, ...(info ? { info } : {}) }, proposalIds: r.proposalIds, reason: r.reason });
    }
    const [pid] = r.proposalIds;
    if (f.applyToNew && pid && isEmptyTrip(t)) { // AI-78: pressing "Skapa med AI" approved the draft of the new trip
      const p = (await store.proposals(t.id)).find((x) => x.id === pid)!;
      const done = await apply(t, p.ops, `ai (${actorName(c, t)})`, p.reason || "ai draft");
      if ("revision" in done) {
        p.status = "approved";
        await store.saveProposal(p);
        return c.json({ applied: true, revision: done.revision, proposalId: pid, proposalIds: r.proposalIds, reason: r.reason });
      }
    }
    return c.json({ proposalId: r.proposalIds[0] ?? null, proposalIds: r.proposalIds, reason: r.reason }, r.proposalIds.length ? 202 : 200);
  });

  // US-02, US-03, US-04, US-12: the superuser manages the accounts; the admin password acts as the first superuser (US-18).
  const superOnly = async (c: Context<Env>, next: () => Promise<void>) => (c.get("role") === "admin" && !scoped(c) ? next() : c.json({ error: "forbidden" }, 403));
  app.use("/api/users", superOnly);
  app.use("/api/users/*", superOnly);
  const selfOf = async (c: Context<Env>) => c.get("user")?.id ?? firstSuper(await store.users())?.id;
  /** A new password link: the secret goes to the superuser once, only its hash is kept (US-04). */
  const newSetup = async (u: User) => {
    const secret = newSecret(), expires = new Date(clock().getTime() + SETUP_DAYS * 86_400_000).toISOString();
    await store.saveUser({ ...u, setup: { hash: await sha256(secret), expires } });
    return { secret, expires };
  };
  app.get("/api/users", async (c) => c.json((await store.users()).map(publicUser)));
  app.post("/api/users", async (c) => {
    const b = await c.req.json<{ name?: unknown; email?: unknown }>().catch(() => ({} as { name?: unknown; email?: unknown }));
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "", email = typeof b.email === "string" ? normEmail(b.email) : "";
    if (!name || !validEmail(email)) return c.json({ error: "name and a valid address needed" }, 400);
    const users = await store.users();
    if (users.some((u) => u.email === email)) return c.json({ error: "address in use" }, 409);
    let id = slug(name);
    for (let n = 2; users.some((u) => u.id === id); n++) id = `${slug(name)}-${n}`;
    const u: User = { id, name, email, superuser: users.length === 0, disabled: false, ai: false, createdAt: clock().toISOString() }; // the first account is the superuser
    if (users.length === 0) for (const t of await store.list()) if (!(await store.owners())[t.id]) await store.saveOwner(t.id, id); // US-13: the trips so far
    return c.json({ user: publicUser(u), setup: await newSetup(u) }, 201);
  });
  /** The account in the path, and whether a change would leave no superuser who can log in (US-12). */
  const target = async (c: Context<Env>) => {
    const users = await store.users(), u = users.find((x) => x.id === c.req.param("uid"));
    const lastSuper = (next?: User) => !users.map((x) => (x.id === next?.id ? next : x)).some((x) => x.superuser && !x.disabled);
    return { u, self: u?.id === await selfOf(c), lastSuper };
  };
  app.patch("/api/users/:uid", async (c) => {
    const { u, self, lastSuper } = await target(c);
    if (!u) return c.json({ error: "not found" }, 404);
    const b = await c.req.json<{ disabled?: unknown; superuser?: unknown; ai?: unknown }>().catch(() => ({} as Record<string, unknown>));
    const next: User = { ...u, ...(typeof b.disabled === "boolean" ? { disabled: b.disabled } : {}), ...(typeof b.superuser === "boolean" ? { superuser: b.superuser } : {}), ...(typeof b.ai === "boolean" ? { ai: b.ai } : {}) };
    if ((self && (next.disabled || !next.superuser)) || lastSuper(next)) return c.json({ error: "forbidden" }, 403); // never oneself, never the last one
    await store.saveUser(next);
    return c.json(publicUser(next));
  });
  app.post("/api/users/:uid/setup", async (c) => {
    const { u } = await target(c);
    return u ? c.json(await newSetup(u)) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/users/:uid", async (c) => {
    const { u, self, lastSuper } = await target(c);
    if (!u) return c.json({ error: "not found" }, 404);
    if (self || lastSuper({ ...u, disabled: true })) return c.json({ error: "forbidden" }, 403);
    const heir = await selfOf(c);
    for (const [tripId, owner] of Object.entries(await store.owners())) if (owner === u.id) await store.saveOwner(tripId, heir ?? null); // US-13
    await store.removeUser(u.id);
    return c.body(null, 204);
  });

  // US-26: the beta notice, accepted once per account.
  app.post("/api/consent", async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "accounts only" }, 404);
    if (!u.consentAt) await store.saveUser({ ...u, consentAt: clock().toISOString() });
    return c.body(null, 204);
  });
  // US-27: "Tyck till" during the beta, from an account that accepted the notice; the superuser reads it.
  app.post("/api/feedback", async (c) => {
    const u = c.get("user");
    if (!u?.consentAt) return c.json({ error: "forbidden" }, 403);
    const b = await c.req.json<{ text?: unknown; page?: unknown; tripId?: unknown }>().catch(() => ({} as { text?: unknown; page?: unknown; tripId?: unknown }));
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text || text.length > 2000) return c.json({ error: "1 to 2000 characters" }, 400);
    const page = typeof b.page === "string" ? b.page.slice(0, 40) : "";
    await store.saveFeedback({ id: crypto.randomUUID(), at: clock().toISOString(), who: u.id, name: u.name, text, page, ...(typeof b.tripId === "string" ? { tripId: b.tripId.slice(0, 80) } : {}) });
    return c.body(null, 201);
  });
  app.get("/api/feedback", async (c) => (c.get("role") === "admin" && !scoped(c) ? c.json((await store.feedback()).sort((a, b) => b.at.localeCompare(a.at))) : c.json({ error: "forbidden" }, 403)));
  const dayIn = (tz: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(clock());
  // US-28: a consenting user opened one of the trip's four pages today; kept once per day.
  app.post("/api/trips/:id/seen", async (c) => {
    const u = c.get("user");
    if (!u?.consentAt) return c.body(null, 204); // nothing is kept without the notice accepted
    const { tab } = await c.req.json<{ tab?: unknown }>().catch(() => ({ tab: undefined }));
    if (tab !== "dr" && tab !== "nala" && tab !== "up" && tab !== "mi") return c.json({ error: "unknown page" }, 400);
    const t = await load(c.req.param("id"));
    await store.saveUsage({ tripId: t.id, who: u.id, tab, day: dayIn(t.timezone) });
    return c.body(null, 204);
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
  return Object.assign(app, { aiTick });
}
