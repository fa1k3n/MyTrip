import { z, ZodError } from "zod";

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
  start: Time.optional(), end: Time.optional(), estimated: z.boolean().default(false),
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
});
export const Booking = z.object({
  id: Id, name: z.string().min(1), from: Date_, to: Date_,
  status: z.enum(["ready", "paid", "cancelled"]),
  reference: z.string().optional(), // sensitive: removed for read-only tokens
  amount: z.object({ value: z.number(), currency: z.string().length(3) }).optional(),
  placeId: Id.optional(), note: z.string().optional(),
});
export const Task = z.object({ id: Id, text: z.string().min(1), done: z.boolean(), due: Date_.optional(), placeId: Id.optional() });
export const Traveler = z.object({ id: Id, name: z.string().min(1), age: z.number().int().optional(), packing: z.array(z.string()) });
export const Stop = z.object({ label: z.string(), sub: z.string(), dayId: Id });
export const Dream = z.object({ id: Id, title: z.string().min(1), category: z.string().min(1), source: z.string(), icon: z.string().min(1), votes: z.number().int().nonnegative() });
export const BudgetItem = z.object({ id: Id, category: z.string().min(1), amount: z.number().nonnegative(), paid: z.boolean(), owner: z.string().optional() });

export const Trip = z.object({
  id: Id, revision: z.number().int().nonnegative(), title: z.string(), timezone: z.string(),
  purpose: z.string().default(""),
  image: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png|webp)$/).optional(), imageAlt: z.string().optional(),
  dateLabel: z.string().optional(), // shown when the trip has no days, e.g. "jul 2026 · avslutad"
  note: z.string().optional(), inbox: z.string().email().optional(),
  currency: z.string().length(3).default("SEK"), // budget amounts are in this currency
  dreams: z.array(Dream).default([]), budget: z.array(BudgetItem).default([]),
  stops: z.array(Stop), days: z.array(Day), places: z.array(Place),
  bookings: z.array(Booking), tasks: z.array(Task), travelers: z.array(Traveler),
});
export type Trip = z.infer<typeof Trip>;

export function describeError(e: unknown): string[] {
  return e instanceof ZodError ? e.issues.map((i) => `${i.path.join("/")}: ${i.message}`) : [String(e)];
}
