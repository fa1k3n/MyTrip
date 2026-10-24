import type { Op, Trip } from "@trip/schema";

// Dev only: a real login replaces this token.
const TOKEN = import.meta.env.VITE_TRIP_TOKEN ?? "";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { ...init, headers });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return (r.status === 204 ? undefined : await r.json()) as T;
}
const trip = (id: string) => `/api/trips/${encodeURIComponent(id)}`;

export const api = {
  trips: () => call<Trip[]>("/api/trips"),
  create: (title: string) => call<Trip>("/api/trips", { method: "POST", body: JSON.stringify({ title }) }),
  remove: (id: string) => call<void>(trip(id), { method: "DELETE" }),
  change: (t: Trip, ops: Op[], reason: string) =>
    call<unknown>(`${trip(t.id)}/changes`, { method: "POST", body: JSON.stringify({ baseRevision: t.revision, ops, reason }) }),
  image: async (id: string) => {
    const r = await fetch(`${trip(id)}/image`, { headers });
    if (!r.ok) throw new Error(`${r.status} image`);
    return URL.createObjectURL(await r.blob());
  },
};

export const maskedToken = () => "••••••••••••" + TOKEN.slice(-4);
