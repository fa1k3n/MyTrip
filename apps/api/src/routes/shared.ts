// What the API routes share: the store and its types, a trip as each role may see it, ticket files and the options of createApp.
import { Settings, Trip, TicketFile, accessFor, atLeast, opNeeds, secretsOf, similarTitles, whoFor, type AccessRole, type BookingReading, type Op, type WishReading } from "@trip/schema";
import { type TrafficOpts } from "../traffic.ts";
import { type AiCall, type AiFeature } from "../ai.ts";
import { type Google, type User } from "../users.ts";
import { type Mailer } from "../mailer.ts";
export type { User } from "../users.ts";

export type Proposal = {
  id: string; tripId: string; baseRevision: number; ops: Op[]; reason: string; status: "pending" | "approved" | "rejected" | "wish"; at: string;
  wishId?: string; // status "wish": the mail of this mailed wish, kept so it can become a booking (BK-33)
  source?: { kind: "mail"; from: string; subject: string; at: string } // a mail to the trip's inbox (BK-15)
    | { kind: "ai"; feature: string; by: string; at: string; item?: boolean; day?: string; memories?: string[] }; // memories: earlier trips used (AI-91); an AI feature in the app (AI-01, AI-65); item: one suggestion of a helper (AI-70); day: the day its activity is on (AI-77)
  booking?: BookingReading & { files?: TicketFile[] }; // what was read from it; approved with the edited booking (BK-17)
  wish?: WishReading & { source: string }; // the same mail read as a wish, for Gör till önskan (BK-29)
  mailText?: string; // the mail's subject and text without mejl addresses and telephone numbers, for "Läs med AI"; never sent to the browser (AI-60)
};
/** A ticket file's owner and type; its bytes are kept apart from the trip data (BK-13). */
export type FileMeta = { id: string; tripId: string; type: TicketFile["type"] | "image/webp" }; // webp: wish images (DB-08); tripId "_commons": the shared cache (DB-11)
export type LogEntry = { at: string; tripId: string; actor: string; reason: string; ops: Op[] };
/** A traveler's personal link to one trip, with the permission Resenär (traveler) or Planerare (planner) (AU-11). */
export type PersonLink = { tripId: string; travelerId: string; secret: string; role: "traveler" | "planner"; account?: string }; // account: the tied address (US-21)
/** A phone that wants notices for a trip (NT-03): who is a traveler id, "follower" for the common link, or "admin". */
/** A note sent with "Tyck till" during the beta (US-27). */
export type Feedback = { id: string; at: string; who: string; name: string; text: string; page: string; tripId?: string; reply?: string; replyAt?: string; version?: string }; // reply: US-34; version: US-38
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
export type Role = "read" | "propose" | "admin" | "link" | "traveler" | "planner" | "owner" | "account";
export const rank: Record<Role, number> = { link: 1, read: 1, traveler: 1, account: 1, propose: 2, planner: 2, owner: 2, admin: 3 };
export const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

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
    saveFeedback: async (f) => { notes = [...notes.filter((x) => x.id !== f.id), structuredClone(f)]; }, // US-34: an answer replaces the note
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

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trip";

/** Compares secrets without stopping at the first difference. */
export function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export const SESSION_DAYS = 30, MAX_FAILS = 5, FAIL_WINDOW_MS = 15 * 60_000;
/** Bytes as base64, in parts so a large photo does not overflow the call stack (AI-42). */
export const toBase64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
/** 144 random bits as base64url (AU-01). */
/** 80 random bits in lowercase letters and digits, for an inbox address (BK-14). */
export const inboxSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
export const newSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, "-").replace(/\//g, "_");
/** The role a link has in the trip's permissions (AU-20). */
export const accessRole = (role: Role): AccessRole | undefined => (role === "link" ? "follower" : role === "traveler" || role === "planner" ? role : undefined);
/** Whether a link's role may make all these changes under the trip's permissions (AU-21, AU-22). Below "write" on expenses,
 * an expense is added one at a time and alone (AU-13). The permissions are set by a Planerare, not by a Resenär (AU-22). */
/** A trip without its dismissed warnings, whose texts may name what is hidden from the viewer; only a Planerare dismisses (DQ-11). */
export const withoutDismissed = <T extends { dismissed?: unknown }>({ dismissed: _d, ...t }: T) => t as Omit<T, "dismissed">;
export function linkMayChange(t: Trip, ar: AccessRole, ops: Op[], travelerId?: string) {
  const rules = accessFor(t, ar);
  const ok = ops.length > 0 && ops.every((o) => {
    if (relinksOwn(t, o, travelerId)) return true; // MI-41
    const n = opNeeds(o);
    return n.part === "access" || n.part === "trip" ? ar === "planner"
      : n.part === "memories" ? atLeast(rules.view.mi.memories ?? "hidden", n.level) : atLeast(rules.parts[n.part], n.level); // MI-21
  });
  const adds = ops.some((o) => o.op === "add" && o.path === "expenses/-");
  return ok && (!adds || rules.parts.expenses === "write" || ops.length === 1);
}
/** A traveler moves an expense they added to another wish or none, with its activity, and confirms its category; nothing else of it (MI-41). */
export function relinksOwn(t: Trip, o: Op, travelerId?: string) {
  const m = /^expenses\/(\d+)\/(activityId|dreamId|category)$/.exec(o.path);
  return !!m && !!travelerId && (o.op === "set" || (o.op === "remove" && m[2] !== "category")) && t.expenses[Number(m[1])]?.addedBy === travelerId;
}
export type Activity = Trip["days"][number]["activities"][number];
/** Activities hidden from the viewer, without title, note, places or category, and without places only they use (AU-18).
 * A day's title, summary and timeline label that resemble such an activity are emptied too (AU-27), and the legs of its
 * day lose their places, so no route map gives it away (AU-28). Every other text that resembles an activity hidden from the
 * viewer anywhere in the trip, or links a place whose name does, is emptied and its item marked hidden (AU-30). */
export function masked<T extends Omit<Trip, "budgetMax">>(t: T, hiddenFor: (a: Activity) => boolean, hides: (who: string[]) => boolean): T {
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
export function changedPaths(a: unknown, b: unknown, path = ""): string[] {
  if (a === b) return [];
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return [path];
  if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== (b as unknown[]).length)) return [path];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((k) => changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}/${k}` : k));
}
/** True when an operation would change or replace something masked for the viewer; ticking a hidden task is fine (AU-30). */
export const touchesMasked = (o: Op, paths: string[]) => !(/^tasks\/\d+\/done$/.test(o.path) && o.op === "set") &&
  paths.some((p) => p === o.path || p.startsWith(`${o.path}/`) || o.path.startsWith(`${p}/`));
/** True when the change approves an expense: one that was unhandled, or is new, and is not unhandled after it (MI-12). */
export function approvesExpense(before: Trip, after: Trip) {
  const was = new Map(before.expenses.map((e) => [e.id, !!e.pending]));
  return after.expenses.some((e) => !e.pending && (was.get(e.id) ?? true));
}
/** True when the change hides an activity from the traveler making it, which no one may do (AU-18). */
export function hidesFromSelf(before: Trip, after: Trip, travelerId: string) {
  const was = new Map(before.days.flatMap((d) => d.activities).map((a) => [a.id, a.hiddenFrom ?? []]));
  return after.days.flatMap((d) => d.activities).some((a) => a.hiddenFrom?.includes(travelerId) && !was.get(a.id)?.includes(travelerId));
}
/** True when the change adds, changes or removes a memory of another traveler than the one making it (MI-22). */
export function othersMemories(before: Trip, after: Trip, travelerId: string) {
  const key = (m: Trip["memories"][number]) => JSON.stringify(m);
  const was = new Set(before.memories.filter((m) => m.by !== travelerId).map(key));
  const now = new Set(after.memories.filter((m) => m.by !== travelerId).map(key));
  return was.size !== now.size || [...was].some((k) => !now.has(k));
}
/** New expenses from a personal link are paid and added by its traveler; null when one names someone else (AU-13). */
export function ownExpenses(ops: Op[], travelerId: string): Op[] | null {
  const out: Op[] = [];
  for (const o of ops) {
    if (o.op !== "add" || o.path !== "expenses/-" || typeof o.value !== "object" || o.value === null) { out.push(o); continue; }
    const v = o.value as { paidBy?: unknown; addedBy?: unknown };
    if ((v.paidBy !== undefined && v.paidBy !== travelerId) || (v.addedBy !== undefined && v.addedBy !== travelerId)) return null;
    out.push({ ...o, value: { ...v, paidBy: travelerId, addedBy: travelerId } });
  }
  return out;
}

export const withoutInbox = ({ inbox: _inbox, ...t }: Trip): Trip => t;
export const withoutWishInbox = ({ wishInbox: _w, ...t }: Trip): Trip => t;
/** The ticket files that bookings use. */
export const fileIdsOf = (bookings: Trip["bookings"]) => bookings.flatMap((b) => (b.files ?? []).map((f) => f.id));
/** The image files of wishes; only own photos belong to the trip, Commons files to the shared cache (DB-08, DB-11). */
export const wishFiles = (dreams: Trip["dreams"], own = false) => dreams.flatMap((w) => (w.image && (!own || w.image.kind === "own") ? [w.image.file] : []));
/** The owner of the files that the image cache shares between trips (DB-11). */
export const COMMONS_FILES = "_commons";
/** The ticket files of a trip's pending proposals, which the reviewer opens before approving (BK-17). */
export const proposalFiles = (ps: Proposal[]) => ps.filter((p) => p.status === "pending").flatMap((p) => (p.booking?.files ?? []).map((f) => f.id));
/** The types a ticket may have, each with the first bytes its content starts with (BK-09). */
export const MAGIC: Record<TicketFile["type"], number[]> = { "application/pdf": [0x25, 0x50, 0x44, 0x46], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff] };
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

export type Env = { Variables: { role: Role; tripId?: string; travelerId?: string; user?: User } };
/** True when a subscription matches every given field. */
/** The order every store lists subscriptions in. */
export const bySubscriber = (a: PushSub, b: PushSub) => a.who.localeCompare(b.who) || a.endpoint.localeCompare(b.endpoint);
export const pushMatch = (x: PushSub, m: { endpoint?: string; who?: string }) => (!m.endpoint || x.endpoint === m.endpoint) && (!m.who || x.who === m.who);

/** The AI service and the features it runs; tests give their own (AI-65). */
export type AiOpts = { call: AiCall; features?: Record<string, AiFeature> };
export const onItsDay = (t: Trip, p: Proposal) => {
  const day = p.source?.kind === "ai" ? p.source.day : undefined, i = day ? t.days.findIndex((d) => d.id === day) : -1;
  if (!day) return p.ops;
  if (i < 0) return undefined;
  return p.ops.map((o) => {
    if (!/^days\/\d+\/activities\/-$/.test(o.path)) return { ...o, path: o.path.replace(/^days\/\d+\//, `days/${i}/`) };
    const start = (o.value as { start?: string }).start, at = start ? t.days[i]!.activities.findIndex((a) => !!a.start && a.start > start) : -1;
    return { ...o, path: `days/${i}/activities/${at < 0 ? "-" : at}` }; // before the first that starts later
  });
};

/** What createApp is given besides the store and the tokens. */
export type AppOpts = { aiService?: boolean; ai?: AiOpts; onChange?: (tripId: string) => Promise<void>; auth?: Auth; vapidKey?: string; inboxDomain?: string; mail?: Mailer & { appUrl: string } } & TrafficOpts;

