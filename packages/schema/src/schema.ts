import { z, ZodError } from "zod";
import { AccessConfig } from "./access.ts";

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const Time = z.string().regex(/^\d\d:\d\d$/);
const Date_ = z.string().regex(/^\d{4}-\d\d-\d\d$/);

export const Place = z.object({
  id: Id, name: z.string().min(1), address: z.string().min(1),
  phone: z.string().optional(), notes: z.string().optional(),
  website: z.string().url().optional(), bookingUrl: z.string().url().optional(), bookingLabel: z.string().optional(),
});
export const Activity = z.object({
  id: Id, text: z.string().min(1), placeIds: z.array(Id).default([]),
  note: z.string().optional(), // shown under the short title (ED-19)
  start: Time.optional(), end: Time.optional(), estimated: z.boolean().default(false),
  durationMin: z.number().int().positive().optional(), // estimated length; a fixed `end` wins (DM-13)
  category: z.string().min(1).optional(), // same list as the wishes; gives the day its icons (DC-14)
  hiddenFrom: z.array(Id).optional(), // the travelers it is hidden from, e.g. a surprise for the children (AU-18)
  hidden: z.boolean().optional(), // only in what a Resenär or Följare receives: hidden from them, title and places removed (AU-18)
});
export const Leg = z.object({
  vehicle: z.enum(["car", "ferry", "train", "transit", "walk"]), origin: z.string().min(1), destination: z.string().min(1),
  departure: Time.optional(), durationMin: z.number().int().positive().optional(), waypoints: z.array(z.string()).default([]),
});
export const Day = z.object({
  id: Id, date: Date_, title: z.string().min(1), summary: z.string().min(1),
  icons: z.array(z.string()).min(1).max(2),
  start: Time, end: Time,
  estimated: z.boolean().default(false), // both ends; startEstimated/endEstimated mark one end (TM-06)
  startEstimated: z.boolean().optional(), endEstimated: z.boolean().optional(),
  location: z.string().optional(), // where the day is mostly spent (WX-01)
  weather: z.object({ lat: z.number(), lon: z.number() }).optional(),
  legs: z.array(Leg).default([]),
  activities: z.array(Activity),
  hiddenTitle: z.boolean().optional(), // only in what a Resenär or Följare receives: title and summary give away a hidden activity (AU-27)
  hiddenSummary: z.boolean().optional(), // only in what a Resenär or Följare receives: the summary gives away a hidden activity (AU-30)
  hiddenRoute: z.boolean().optional(), // only in what a Resenär or Följare receives: the legs lost their places, no route map (AU-28)
});
export const Booking = z.object({
  id: Id, name: z.string().min(1), from: Date_, to: Date_,
  status: z.enum(["ready", "paid", "cancelled"]),
  reference: z.string().optional(), // sensitive: removed for read-only tokens
  amount: z.object({ value: z.number(), currency: z.string().length(3) }).optional(),
  placeId: Id.optional(), note: z.string().optional(),
  hidden: z.boolean().optional(), // only in what a Resenär or Följare receives: its texts give away a hidden activity (AU-30)
});
export const Task = z.object({ id: Id, text: z.string().min(1), done: z.boolean(), due: Date_.optional(), placeId: Id.optional(), hidden: z.boolean().optional() }); // hidden: AU-30
export const Traveler = z.object({
  id: Id, name: z.string().min(1), age: z.number().int().optional(), packing: z.array(z.string()),
  packed: z.array(z.string()).default([]), // the items in `packing` that are checked (PK-05)
});
export const Stop = z.object({ label: z.string(), sub: z.string(), dayId: Id });
export const Dream = z.object({ id: Id, title: z.string().min(1), category: z.string().min(1), source: z.string(), icon: z.string().min(1), votes: z.number().int().nonnegative(), hidden: z.boolean().optional() }); // hidden: AU-30
export const Expense = z.object({
  id: Id, text: z.string().min(1), category: z.string().min(1), amount: z.number().positive(),
  paidBy: Id, sharedBy: z.array(Id).default([]), // empty: shared by every traveler (MI-02)
  date: Date_.optional(),
  addedBy: Id.optional(), addedAt: z.string().datetime().optional(), // who added it, among the travelers, and when (UP-13)
  hidden: z.boolean().optional(), // only in what a Resenär or Följare receives: its texts give away a hidden activity (AU-30)
});
export const Payment = z.object({ id: Id, from: Id, to: Id, amount: z.number().positive(), date: Date_.optional(), note: z.string().optional(), hidden: z.boolean().optional() }) // hidden: AU-30
  .refine((p) => p.from !== p.to, { message: "A payment needs two different travelers", path: ["to"] }); // MI-06
export const BudgetItem = z.object({
  id: Id, category: z.string().min(1), paid: z.boolean(), owner: z.string().optional(),
  amount: z.number().nonnegative().optional(), // missing: not checked yet (BG-06)
  amountMax: z.number().nonnegative().optional(), // upper end of a range, e.g. 75–100 (BG-03)
  estimate: z.boolean().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), // default: the trip's currency (BG-07)
  note: z.string().optional(),
  hidden: z.boolean().optional(), // only in what a Resenär or Följare receives: its texts give away a hidden activity (AU-30)
});
/** Practical information such as parking options (PI-01..PI-05). */
export const Info = z.object({
  id: Id, title: z.string().min(1), text: z.string().default(""), placeId: Id.optional(),
  unsuitable: z.string().optional(), // the reason when the option does not suit the trip (PI-03)
  verify: z.boolean().optional(), // from a source that may be out of date (PI-04)
  hidden: z.boolean().optional(), // only in what a Resenär or Följare receives: its texts give away a hidden activity (AU-30)
});

export const Trip = z.object({
  id: Id, revision: z.number().int().nonnegative(), title: z.string(), timezone: z.string(),
  purpose: z.string().default(""),
  image: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png|webp)$/).optional(), imageAlt: z.string().optional(),
  dateLabel: z.string().optional(), // shown when the trip has no days, e.g. "jul 2026 · avslutad"
  note: z.string().optional(), inbox: z.string().email().optional(),
  hiddenPurpose: z.boolean().optional(), hiddenNote: z.boolean().optional(), // only in what a Resenär or Följare receives (AU-30)
  ai: z.boolean().default(true), // AI-62: can only narrow the instance settings
  currency: z.string().length(3).default("SEK"), // budget amounts are in this currency
  budgetMax: z.number().positive().optional(), // maximum budget in `currency` (BG-12)
  access: AccessConfig.optional(), // what each role may see and change; missing: the defaults (AU-20)
  dreams: z.array(Dream).default([]), budget: z.array(BudgetItem).default([]),
  expenses: z.array(Expense).default([]), payments: z.array(Payment).default([]),
  info: z.array(Info).default([]), packing: z.array(z.string()).default([]), // packing: the shared list (PK-01)
  packed: z.array(z.string()).default([]), // checked items of the shared list (PK-05)
  stops: z.array(Stop), days: z.array(Day), places: z.array(Place),
  bookings: z.array(Booking), tasks: z.array(Task), travelers: z.array(Traveler),
});
export type Trip = z.infer<typeof Trip>;

export function describeError(e: unknown): string[] {
  return e instanceof ZodError ? e.issues.map((i) => `${i.path.join("/")}: ${i.message}`) : [String(e)];
}
