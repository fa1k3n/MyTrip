// Ticket files on the phone: which to keep, and how a picked file is handled before upload (BK-09, BK-12). Pure, so it runs under node --test.
import type { Trip } from "@trip/schema";

const MAX = 2 * 1024 * 1024;
/** What to do with a picked file: upload it, scale the image down to JPEG first, refuse a too large PDF, or refuse the type. */
export function checkPick(f: { type: string; size: number }): "ok" | "scale" | "tooBig" | "type" {
  if (f.type === "application/pdf") return f.size > MAX ? "tooBig" : "ok";
  if (f.type === "image/png" || f.type === "image/jpeg") return f.size > MAX ? "scale" : "ok";
  return f.type.startsWith("image/") ? "scale" : "type"; // HEIC and other photos become JPEG
}
/** The size of an image scaled down so its longest side is at most `max`; never scaled up. */
export function fitSize(w: number, h: number, max: number) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
/** The ids of every ticket file in the trips the phone keeps, one list of trips per link (BK-12). */
export const filesToKeep = (lists: { bookings: { files?: { id: string }[] }[] }[][]) =>
  new Set(lists.flat().flatMap((t) => t.bookings.flatMap((b) => (b.files ?? []).map((f) => f.id))));
/** True when a booking has ticket files to open (BK-10). */
export const hasTickets = (b: { files?: unknown[] }) => (b.files?.length ?? 0) > 0;
/** The booking with ticket files linked to an activity, not cancelled (BK-08). */
export const ticketFor = (t: Trip, activityId: string) =>
  t.bookings.find((b) => b.activityId === activityId && b.status !== "cancelled" && hasTickets(b));
