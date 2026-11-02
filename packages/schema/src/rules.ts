// Permissions per trip and role: which tabs are visible and the level of each kind of content, wherever it is shown (AU-21, AU-22, AU-36).
// Inside, the content levels become levels per page and component, which the app and the server read.
// No zod here, so the web app can use the rules without loading the schema (PF-01); the stored form is checked in access.ts.
import type { Op } from "./ops.ts";

export const PAGES = ["dr", "nala", "up", "mi"] as const;
export type Page = (typeof PAGES)[number];
export type Level = "hidden" | "read" | "check" | "add" | "write";
export type AccessRole = "follower" | "traveler" | "planner";
const H = "hidden", R = "read", C = "check", A = "add", W = "write";

/** The components of each page and the levels each offers there, lowest first. Uppleva is read-only, except adding an expense. */
export const PAGE_PARTS = {
  dr: { dreams: [H, R, W] },
  nala: { plan: [R, W], bookings: [H, R, W], budget: [H, R, W], tasks: [H, R, C, W], info: [H, R, W], packing: [H, R, C, W] },
  up: { budget: [H, R], bookings: [H, R], expenses: [H, A] }, // the day itself is always shown
  mi: { expenses: [H, R, A, W], budget: [H, R], memories: [H, R, W] }, // budget: the follow-up against actual expenses; memories: MI-21
} as const satisfies Record<Page, Record<string, readonly Level[]>>;
/** The data behind the components: days and activities (plan), bookings, budget, expenses, tasks, packing lists, information, wishes. */
export const PARTS = ["plan", "bookings", "budget", "expenses", "tasks", "packing", "info", "dreams"] as const;
export type Part = (typeof PARTS)[number];
const order: Record<Level, number> = { hidden: 0, read: 1, check: 2, add: 2, write: 3 };
export const atLeast = (have: Level, need: Level) => order[have] >= order[need];
const max = (a: Level, b: Level) => (order[b] > order[a] ? b : a);

type PageRules = { visible: boolean; parts: Record<string, Level> };
type RoleRules = Record<Page, PageRules>;

/** The kinds of content a role is given a level for, wherever they are shown (AU-36). money: the budget and the expenses;
 * todo: the tasks and the packing lists. */
export const CONTENT = ["plan", "dreams", "bookings", "money", "todo", "info", "memories"] as const;
export type Content = (typeof CONTENT)[number];
const CONTENT_LEVELS: Record<Content, Level[]> = { plan: [R, W], dreams: [H, R, W], bookings: [H, R, W], money: [H, R, A, W], todo: [H, R, C, W], info: [H, R, W], memories: [H, R, W] };
/** The levels a role may be given for a content: a Följare is no person, so it adds and changes no expenses and has no memories (AU-22, MI-21). */
export const contentLevels = (role: AccessRole, c: Content): Level[] =>
  role === "follower" && c === "money" ? [H, R] : role === "follower" && c === "memories" ? [H] : [...CONTENT_LEVELS[c]];

export type RoleAccess = { tabs?: Partial<Record<Page, boolean>>; content?: Partial<Record<Content, Level>> };
/** What a trip stores: the choices for Resenär and Följare that differ from the defaults; a Planerare always has everything (AU-14). */
export type AccessConfig = { follower?: RoleAccess; traveler?: RoleAccess };
/** The form stored before AU-36: per page, its visibility and the level of each component on it. */
export type LegacyRole = Partial<Record<Page, { visible?: boolean; parts?: Record<string, Level> }>>;

/** The earlier fixed rules, now the defaults (AU-03, AU-12, AU-14, AU-17, AU-19). */
const DEFAULTS: Record<AccessRole, { tabs: Record<Page, boolean>; content: Record<Content, Level> }> = {
  follower: { tabs: { dr: false, nala: false, up: true, mi: false }, content: { plan: R, dreams: H, bookings: H, money: H, todo: H, info: H, memories: H } },
  traveler: { tabs: { dr: true, nala: true, up: true, mi: true }, content: { plan: R, dreams: R, bookings: R, money: A, todo: C, info: R, memories: W } },
  planner: { tabs: { dr: true, nala: true, up: true, mi: true }, content: { plan: W, dreams: W, bookings: W, money: W, todo: W, info: W, memories: W } },
};
export const DEFAULT_TABS = (role: AccessRole) => ({ ...DEFAULTS[role].tabs });
export const DEFAULT_CONTENT = (role: AccessRole) => ({ ...DEFAULTS[role].content });

/** Content levels as levels per page and component: Pengar is the budget everywhere and the expenses in Uppleva and Minnas. */
function toRules(tabs: Record<Page, boolean>, c: Record<Content, Level>): RoleRules {
  const seen = (l: Level): Level => (l === H ? H : R), m = c.money;
  return {
    dr: { visible: tabs.dr, parts: { dreams: c.dreams } },
    nala: { visible: tabs.nala, parts: { plan: c.plan, bookings: c.bookings, budget: m === W ? W : seen(m), tasks: c.todo, info: c.info, packing: c.todo } },
    up: { visible: tabs.up, parts: { budget: seen(m), bookings: seen(c.bookings), expenses: m === A || m === W ? A : H } },
    mi: { visible: tabs.mi, parts: { expenses: m, budget: seen(m), memories: c.memories } },
  };
}
export const DEFAULT_ACCESS: Record<AccessRole, RoleRules> = {
  follower: toRules(DEFAULTS.follower.tabs, DEFAULTS.follower.content),
  traveler: toRules(DEFAULTS.traveler.tabs, DEFAULTS.traveler.content),
  planner: toRules(DEFAULTS.planner.tabs, DEFAULTS.planner.content),
};

/** Where each content was set before AU-36, in the order that wins. */
const LEGACY: Record<Content, [Page, string][]> = {
  plan: [["nala", "plan"]], dreams: [["dr", "dreams"]], bookings: [["nala", "bookings"], ["up", "bookings"]],
  money: [["nala", "budget"], ["mi", "expenses"], ["up", "expenses"], ["mi", "budget"], ["up", "budget"]],
  todo: [["nala", "tasks"], ["nala", "packing"]], info: [["nala", "info"]], memories: [["mi", "memories"]],
};
/** Permissions stored per page and component, read as the nearest content levels the role may have (AU-36). */
export function fromLegacy(l: LegacyRole, role: AccessRole): RoleAccess {
  const tabs = Object.fromEntries(PAGES.flatMap((p) => (l[p]?.visible === undefined ? [] : [[p, l[p]!.visible!]])));
  const content = Object.fromEntries(CONTENT.flatMap((c) => {
    const given = LEGACY[c].map(([p, k]) => l[p]?.parts?.[k]).find((x) => x !== undefined);
    if (!given) return [];
    const ok = contentLevels(role, c).filter((x) => order[x] <= order[given]);
    return [[c, ok[ok.length - 1] ?? contentLevels(role, c)[0]!]];
  }));
  return { ...(Object.keys(tabs).length ? { tabs } : {}), ...(Object.keys(content).length ? { content } : {}) };
}
const isLegacy = (r: object) => Object.keys(r).some((k) => k !== "tabs" && k !== "content");
/** A role's own choices on a trip, also when stored in the earlier form (AU-36). */
export function ownAccess(t: { access?: AccessConfig }, role: "follower" | "traveler"): RoleAccess {
  const raw = (t.access as Record<string, object> | undefined)?.[role] ?? {};
  return isLegacy(raw) ? fromLegacy(raw as LegacyRole, role) : (raw as RoleAccess);
}
/** The superuser may do everything (AU-20). */
export const ALL_ACCESS: RoleRules = Object.fromEntries(PAGES.map((p) => [p, {
  visible: true, parts: Object.fromEntries(Object.entries(PAGE_PARTS[p]).map(([k, ls]) => [k, ls[ls.length - 1]])),
}])) as RoleRules;

/** The levels a role may be given on a page's component: a Följare is no person, so it adds and changes no expenses (AU-22)
 * and sees no memories (MI-21). */
export const levelsFor = (role: AccessRole, page: Page, part: string): Level[] => {
  const all = (PAGE_PARTS[page] as Record<string, readonly Level[]>)[part] ?? [];
  if (role === "follower" && part === "memories") return [H];
  return role === "follower" && part === "expenses" ? all.filter((l) => l === H || l === R) : [...all];
};

export type Rules = { pages: Page[]; view: Record<Page, Record<string, Level>>; parts: Record<Part, Level> };
/** Page rules to effective rules: components on hidden pages are hidden; data is sent if any visible page shows it, and the
 * change level comes from the page where a component is changed (Nåla, Summera, Önska; adding an expense also in Uppleva). */
export function resolve(r: RoleRules): Rules {
  const pages = PAGES.filter((p) => r[p].visible);
  const view = Object.fromEntries(PAGES.map((p) => [p, Object.fromEntries(Object.entries(r[p].parts).map(([k, l]) => [k, r[p].visible ? l : H]))])) as Rules["view"];
  const v = (p: Page, k: string): Level => view[p][k] ?? H;
  const seen = (l: Level): Level => (l === H ? H : R);
  const parts: Rules["parts"] = {
    plan: r.nala.visible ? v("nala", "plan") : R, // Uppleva always shows the day
    bookings: max(v("nala", "bookings"), seen(v("up", "bookings"))),
    budget: max(v("nala", "budget"), max(seen(v("up", "budget")), seen(v("mi", "budget")))),
    expenses: max(v("mi", "expenses"), v("up", "expenses")),
    tasks: v("nala", "tasks"), packing: v("nala", "packing"), info: v("nala", "info"), dreams: v("dr", "dreams"),
  };
  return { pages, view, parts };
}

/** The rules for a role on a trip: the trip's choices over the defaults; a Planerare always has everything (AU-14, AU-36). */
export function accessFor(t: { access?: AccessConfig }, role: AccessRole): Rules {
  const d = DEFAULTS[role];
  if (role === "planner") return resolve(toRules(d.tabs, d.content));
  const own = ownAccess(t, role); // the app may get it unparsed, in the earlier form
  return resolve(toRules({ ...d.tabs, ...own.tabs }, { ...d.content, ...own.content }));
}

/** The component and level a change needs. "trip" is the trip's own settings, "access" the permissions (AU-21, AU-22).
 * Memories are shown only in Minnas, so their level is that page's component (MI-21); the album link is a setting (MI-20). */
export function opNeeds(o: Op): { part: Part | "memories" | "trip" | "access"; level: Level } {
  const [head] = o.path.split("/");
  const w = (part: Part | "memories" | "trip" | "access") => ({ part, level: "write" as Level });
  if (/^tasks\/\d+\/done$/.test(o.path) && o.op === "set") return { part: "tasks", level: "check" };
  if (/^(packed|travelers\/\d+\/packed)$/.test(o.path) && o.op === "set") return { part: "packing", level: "check" };
  if (head === "packing" || /^travelers\/\d+\/packing(\/|$)/.test(o.path)) return w("packing");
  if (o.op === "add" && o.path === "expenses/-") return { part: "expenses", level: "add" };
  if (head === "expenses" || head === "payments") return w("expenses");
  if (head === "days" || head === "stops" || head === "places") return w("plan");
  if (head === "budget" || head === "budgetMax") return w("budget");
  if (head === "bookings" || head === "tasks" || head === "info" || head === "dreams") return w(head);
  if (head === "access") return w("access");
  if (head === "memories") return w("memories");
  return w("trip");
}
