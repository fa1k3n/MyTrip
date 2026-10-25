// Turns a local trip folder into SQL for D1, so trip data goes straight from the folder to Cloudflare (DP-10).
// Usage: node apps/api/src/d1-load.ts <trip folder> <out.sql> [trip id …]   (no ids: every trip in the folder)
// Cover images are included, split into parts. Running the SQL again updates the same rows.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Settings, Trip } from "@trip/schema";
import { fileStore } from "./file-store.ts";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const PART = 40_000; // bytes per image part: as hex that is 80 KB, under D1's 100 KB per statement (DP-05)
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function imageSql(name: string, bytes: Uint8Array) {
  const n = Math.max(1, Math.ceil(bytes.length / PART));
  return [
    ...Array.from({ length: n }, (_, i) => `INSERT INTO images (name, part, data) VALUES (${q(name)}, ${i}, X'${hex(bytes.subarray(i * PART, (i + 1) * PART))}') ON CONFLICT (name, part) DO UPDATE SET data = excluded.data;`),
    `DELETE FROM images WHERE name = ${q(name)} AND part >= ${n};`, // a smaller replacement leaves no old parts behind
  ];
}

export function loadSql(data: { trips: Trip[]; settings?: Settings; links?: Record<string, string>; images?: { name: string; bytes: Uint8Array }[] }) {
  return [
    ...data.trips.map((t) => `INSERT INTO trips (id, revision, json) VALUES (${q(t.id)}, ${t.revision}, ${q(JSON.stringify(t))}) ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, json = excluded.json;`),
    ...(data.settings ? [`INSERT INTO settings (key, json) VALUES ('settings', ${q(JSON.stringify(data.settings))}) ON CONFLICT (key) DO UPDATE SET json = excluded.json;`] : []),
    ...Object.entries(data.links ?? {}).map(([id, s]) => `INSERT INTO links (trip_id, secret) VALUES (${q(id)}, ${q(s)}) ON CONFLICT (trip_id) DO UPDATE SET secret = excluded.secret;`),
    ...(data.images ?? []).flatMap((i) => imageSql(i.name, i.bytes)),
  ].join("\n") + "\n";
}

/** The named trips, or all of them; an unknown id is an error, so a typo does not load nothing silently. */
export function pickTrips(trips: Trip[], ids: string[]) {
  const unknown = ids.filter((id) => !trips.some((t) => t.id === id));
  if (unknown.length) throw new Error(`No such trip in the folder: ${unknown.join(", ")}`);
  return ids.length ? trips.filter((t) => ids.includes(t.id)) : trips;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, out, ...ids] = process.argv.slice(2);
  if (!dir || !out) throw new Error("Usage: node apps/api/src/d1-load.ts <trip folder> <out.sql>");
  const store = fileStore(dir);
  const trips = pickTrips(await store.list(), ids);
  const images = await Promise.all(trips.flatMap((t) => (t.image ? [t.image] : [])).map(async (name) => ({ name, bytes: new Uint8Array(await readFile(join(dir, "img", name))) })));
  const links = Object.fromEntries(Object.entries(await store.links()).filter(([id]) => trips.some((t) => t.id === id)));
  await writeFile(out, loadSql({ trips, settings: await store.loadSettings(), links, images }));
  console.log(`${out}: ${trips.length} trips, ${images.length} images`);
}
