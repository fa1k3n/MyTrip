// Permissions per trip and role: which pages are visible and how far each component may be changed (AU-20..AU-22).
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
  mi: { expenses: [H, R, A, W], budget: [H, R] }, // budget: the follow-up against actual expenses
} as const satisfies Record<Page, Record<string, readonly Level[]>>;
/** The data behind the components: days and activities (plan), bookings, budget, expenses, tasks, packing lists, information, wishes. */
export const PARTS = ["plan", "bookings", "budget", "expenses", "tasks", "packing", "info", "dreams"] as const;
export type Part = (typeof PARTS)[number];
const order: Record<Level, number> = { hidden: 0, read: 1, check: 2, add: 2, write: 3 };
export const atLeast = (have: Level, need: Level) => order[have] >= order[need];
const max = (a: Level, b: Level) => (order[b] > order[a] ? b : a);

type PageRules = { visible: boolean; parts: Record<string, Level> };
type RoleRules = Record<Page, PageRules>;
/** What a trip stores: only the choices that differ from the defaults. */
export type AccessConfig = Partial<Record<AccessRole, Partial<Record<Page, { visible?: boolean; parts?: Record<string, Level> }>>>>;

/** The earlier fixed rules, now the defaults (AU-03, AU-12, AU-14, AU-17, AU-19). */
export const DEFAULT_ACCESS: Record<AccessRole, RoleRules> = {
  follower: {
    dr: { visible: false, parts: { dreams: H } },
    nala: { visible: false, parts: { plan: R, bookings: H, budget: H, tasks: H, info: H, packing: H } },
    up: { visible: true, parts: { budget: H, bookings: H, expenses: H } },
    mi: { visible: false, parts: { expenses: H, budget: H } },
  },
  traveler: {
    dr: { visible: true, parts: { dreams: R } },
    nala: { visible: true, parts: { plan: R, bookings: R, budget: R, tasks: C, info: R, packing: C } },
    up: { visible: true, parts: { budget: R, bookings: R, expenses: A } },
    mi: { visible: true, parts: { expenses: A, budget: R } },
  },
  planner: {
    dr: { visible: true, parts: { dreams: W } },
    nala: { visible: true, parts: { plan: W, bookings: W, budget: W, tasks: W, info: W, packing: W } },
    up: { visible: true, parts: { budget: R, bookings: R, expenses: A } },
    mi: { visible: true, parts: { expenses: W, budget: R } },
  },
};
/** The superuser may do everything (AU-20). */
export const ALL_ACCESS: RoleRules = Object.fromEntries(PAGES.map((p) => [p, {
  visible: true, parts: Object.fromEntries(Object.entries(PAGE_PARTS[p]).map(([k, ls]) => [k, ls[ls.length - 1]])),
}])) as RoleRules;

/** The levels a role may be given on a page's component: a Följare is no person, so it adds and changes no expenses (AU-22). */
export const levelsFor = (role: AccessRole, page: Page, part: string): Level[] => {
  const all = (PAGE_PARTS[page] as Record<string, readonly Level[]>)[part] ?? [];
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

/** The rules for a role on a trip: the trip's choices over the defaults. */
export function accessFor(t: { access?: AccessConfig }, role: AccessRole): Rules {
  const own = t.access?.[role] ?? {}, base = DEFAULT_ACCESS[role];
  return resolve(Object.fromEntries(PAGES.map((p) => [p, {
    visible: own[p]?.visible ?? base[p].visible, parts: { ...base[p].parts, ...own[p]?.parts },
  }])) as RoleRules);
}

/** The component and level a change needs. "trip" is the trip's own settings, "access" the permissions (AU-21, AU-22). */
export function opNeeds(o: Op): { part: Part | "trip" | "access"; level: Level } {
  const [head] = o.path.split("/");
  const w = (part: Part | "trip" | "access") => ({ part, level: "write" as Level });
  if (/^tasks\/\d+\/done$/.test(o.path) && o.op === "set") return { part: "tasks", level: "check" };
  if (/^(packed|travelers\/\d+\/packed)$/.test(o.path) && o.op === "set") return { part: "packing", level: "check" };
  if (head === "packing" || /^travelers\/\d+\/packing(\/|$)/.test(o.path)) return w("packing");
  if (o.op === "add" && o.path === "expenses/-") return { part: "expenses", level: "add" };
  if (head === "expenses" || head === "payments") return w("expenses");
  if (head === "days" || head === "stops" || head === "places") return w("plan");
  if (head === "budget" || head === "budgetMax") return w("budget");
  if (head === "bookings" || head === "tasks" || head === "info" || head === "dreams") return w(head);
  if (head === "access") return w("access");
  return w("trip");
}
