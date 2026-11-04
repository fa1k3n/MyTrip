// The stored form of a trip's permissions (AU-36), checked against the levels each content offers (AU-22); the form stored
// before AU-36, per page and component, is still read and turned into content levels.
import { z } from "./zod.ts";
import { CONTENT, contentLevels, fromLegacy, levelsFor, PAGE_PARTS, PAGES, type AccessConfig as Config, type AccessRole, type Level, type Page } from "./rules.ts";

const pageOf = (role: AccessRole, page: Page) => z.object({
  visible: z.boolean().optional(),
  parts: z.object(Object.fromEntries(Object.keys(PAGE_PARTS[page]).map((k) => [k, z.enum(levelsFor(role, page, k) as [Level, ...Level[]]).optional()]))).strict().optional(),
}).strict();
const legacyOf = (role: AccessRole) => z.object(Object.fromEntries(PAGES.map((p) => [p, pageOf(role, p).optional()]))).strict();
const roleOf = (role: AccessRole) => z.object({
  tabs: z.object(Object.fromEntries(PAGES.map((p) => [p, z.boolean().optional()]))).strict().optional(),
  content: z.object(Object.fromEntries(CONTENT.map((c) => [c, z.enum(contentLevels(role, c) as [Level, ...Level[]]).optional()]))).strict().optional(),
}).strict();
const either = (role: "follower" | "traveler") => z.union([roleOf(role), legacyOf(role).transform((l) => fromLegacy(l, role))]);
/** What a trip stores: only the choices that differ from the defaults need to be there. A Planerare's earlier choices are dropped. */
export const AccessConfig = z.object({ follower: either("follower").optional(), traveler: either("traveler").optional(), planner: legacyOf("planner").optional() })
  .strict().transform(({ planner: _p, ...rest }) => rest as Config);
export type AccessConfig = Config;
