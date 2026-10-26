// Ticket files in the browser: kept in the phone's cache storage for offline use (BK-12), and photos scaled down before upload (BK-09).
import type { TicketFile, Trip } from "@trip/schema";
import { api, deviceLinks } from "./api.ts";
import { loadCopy } from "./offline.ts";
import { filesToKeep, fitSize } from "./tickets.ts";

const CACHE = "mytrip-tickets";
const key = (id: string) => `/tickets/${id}`;
const cache = () => ("caches" in self ? caches.open(CACHE) : Promise.reject(new Error("no cache storage")));

/** A ticket file from the phone's cache, or from the server, which then keeps it for offline use. */
export async function ticketBlob(tripId: string, f: TicketFile): Promise<Blob> {
  const hit = await cache().then((c) => c.match(key(f.id))).catch(() => undefined);
  if (hit) return hit.blob();
  const b = await api.file(tripId, f.id);
  await cache().then((c) => c.put(key(f.id), new Response(b, { headers: { "content-type": f.type } }))).catch(() => {});
  return b;
}

/** Fetches the files of the trips shown that the phone lacks, and drops the ones no trip kept on the phone uses (BK-12). */
export async function keepTickets(trips: Trip[]) {
  let c: Cache;
  try { c = await cache(); } catch { return; }
  const kept = deviceLinks().map((l) => { try { return (loadCopy(localStorage, l)?.trips as Trip[] | undefined) ?? []; } catch { return []; } });
  const keep = filesToKeep([trips, ...kept]);
  for (const r of await c.keys()) if (!keep.has(new URL(r.url).pathname.split("/").pop()!)) await c.delete(r);
  if (!navigator.onLine) return;
  for (const t of trips) for (const b of t.bookings) for (const f of b.files ?? [])
    if (!(await c.match(key(f.id)))) await ticketBlob(t.id, f).catch(() => {}); // one at a time: the trip itself comes first
}

/** A photo as JPEG of at most 2 MB, smaller step by step (BK-09); null when it cannot be read or made small enough. */
export async function scaleImage(file: Blob): Promise<Blob | null> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { return null; }
  for (const side of [2400, 1800, 1400, 1000]) {
    const { w, h } = fitSize(bmp.width, bmp.height, side);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const out = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (out && out.size <= 2 * 1024 * 1024) return out;
  }
  return null;
}
