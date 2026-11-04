import { z } from "./zod.ts";

/** AI areas by capability: what the AI may do with the user's data (AI-07). */
export const AI_AREAS = ["images", "texts", "suggestions", "changes", "mail", "receipts", "web", "location"] as const;
export type AiArea = (typeof AI_AREAS)[number];

/** Instance-wide settings. AI is off until a user turns it on (AI-06); an area left out counts as on. */
export const Settings = z.object({
  ai: z.object({
    enabled: z.boolean().default(false),
    areas: z.partialRecord(z.enum(AI_AREAS), z.boolean()).default({}),
    capUsd: z.number().nonnegative().optional(), // the monthly cap for the instance; missing: CAP_USD (AI-03)
    capAccountUsd: z.number().nonnegative().optional(), // the monthly cap per person; missing: CAP_ACCOUNT_USD
  }).prefault({}), // prefault: a missing ai is parsed as {}, so its fields get their defaults (zod 4)
});
export type Settings = z.infer<typeof Settings>;
/** The spending caps per month in USD when none is set (AI-03). */
export const CAP_USD = 10, CAP_ACCOUNT_USD = 3;

/** True when a feature in this area may call the AI service (AI-05, AI-07). */
export const aiOn = (s: Settings, area: AiArea, serviceConfigured: boolean) =>
  serviceConfigured && s.ai.enabled && s.ai.areas[area] !== false;

/** The trip's own switch can only narrow the instance settings (AI-62). */
export const aiOnForTrip = (s: Settings, area: AiArea, serviceConfigured: boolean, trip: { ai: boolean }) =>
  aiOn(s, area, serviceConfigured) && trip.ai;
