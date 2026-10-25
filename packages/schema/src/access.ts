// The stored form of a trip's permissions, checked against the levels each component offers (AU-20, AU-22).
import { z } from "zod";
import { levelsFor, PAGE_PARTS, PAGES, type AccessConfig as Config, type AccessRole, type Level, type Page } from "./rules.ts";

const pageOf = (role: AccessRole, page: Page) => z.object({
  visible: z.boolean().optional(),
  parts: z.object(Object.fromEntries(Object.keys(PAGE_PARTS[page]).map((k) => [k, z.enum(levelsFor(role, page, k) as [Level, ...Level[]]).optional()]))).strict().optional(),
}).strict();
const roleOf = (role: AccessRole) => z.object(Object.fromEntries(PAGES.map((p) => [p, pageOf(role, p).optional()]))).strict();
/** What a trip stores: only the choices that differ from the defaults need to be there. */
export const AccessConfig = z.object({ follower: roleOf("follower").optional(), traveler: roleOf("traveler").optional(), planner: roleOf("planner").optional() }).strict();
export type AccessConfig = Config;
