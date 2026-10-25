// The store on Cloudflare: trips, settings, links, personal links, proposals, the log and cover images in D1 (DP-03..DP-06).
// Cover images can live in R2 instead, when a bucket is bound.
import { Settings, Trip } from "@trip/schema";
import type { LogEntry, PersonLink, Proposal, Store } from "./app.ts";

// The parts of the D1 and R2 bindings the store uses, so the store needs no Cloudflare types and runs in tests.
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Like { prepare(sql: string): D1Stmt; batch(statements: D1Stmt[]): Promise<unknown[]> }
export interface R2Like { get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null> }

const isId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id);

export function d1Store(db: D1Like, images?: R2Like): Store {
  const parse = (row: { id: string; json: string }) => Trip.parse({ ...JSON.parse(row.json), id: row.id });
  return {
    async list() {
      const { results } = await db.prepare("SELECT id, json FROM trips ORDER BY id").all<{ id: string; json: string }>();
      return results.map(parse);
    },
    async load(id) {
      if (!isId(id)) return undefined;
      const row = await db.prepare("SELECT id, json FROM trips WHERE id = ?").bind(id).first<{ id: string; json: string }>();
      return row ? parse(row) : undefined;
    },
    async save(t, baseRevision) {
      const json = JSON.stringify(t);
      if (baseRevision === undefined) {
        await db.prepare("INSERT INTO trips (id, revision, json) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, json = excluded.json")
          .bind(t.id, t.revision, json).run();
        return true;
      }
      // One statement, so two changes on the same revision cannot both win (DP-03).
      const r = await db.prepare("UPDATE trips SET revision = ?, json = ? WHERE id = ? AND revision = ?").bind(t.revision, json, t.id, baseRevision).run();
      return r.meta.changes === 1;
    },
    async remove(id) {
      if (!isId(id)) return false;
      return (await db.prepare("DELETE FROM trips WHERE id = ?").bind(id).run()).meta.changes === 1;
    },
    async image(name) { // name is checked by the schema
      if (images) {
        const obj = await images.get(name);
        return obj ? new Uint8Array(await obj.arrayBuffer()) : undefined;
      }
      // D1 returns a BLOB as an array of numbers, SQLite in tests as a Uint8Array; both become bytes here.
      const { results } = await db.prepare("SELECT data FROM images WHERE name = ? ORDER BY part").bind(name).all<{ data: ArrayLike<number> }>();
      if (!results.length) return undefined;
      const parts = results.map((r) => Uint8Array.from(r.data)), out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) { out.set(p, at); at += p.length; }
      return out;
    },
    async loadSettings() {
      const row = await db.prepare("SELECT json FROM settings WHERE key = 'settings'").first<{ json: string }>();
      return Settings.parse(row ? JSON.parse(row.json) : {});
    },
    async saveSettings(s) {
      await db.prepare("INSERT INTO settings (key, json) VALUES ('settings', ?) ON CONFLICT (key) DO UPDATE SET json = excluded.json").bind(JSON.stringify(s)).run();
    },
    async links() {
      const { results } = await db.prepare("SELECT trip_id, secret FROM links").all<{ trip_id: string; secret: string }>();
      return Object.fromEntries(results.map((r) => [r.trip_id, r.secret]));
    },
    async saveLinks(l) {
      await db.batch([db.prepare("DELETE FROM links"), ...Object.entries(l).map(([id, s]) => db.prepare("INSERT INTO links (trip_id, secret) VALUES (?, ?)").bind(id, s))]);
    },
    async personLinks() {
      const { results } = await db.prepare("SELECT trip_id, traveler_id, secret, role FROM person_links ORDER BY trip_id, traveler_id")
        .all<{ trip_id: string; traveler_id: string; secret: string; role: PersonLink["role"] }>();
      return results.map((r) => ({ tripId: r.trip_id, travelerId: r.traveler_id, secret: r.secret, role: r.role }));
    },
    async savePersonLinks(l) {
      await db.batch([db.prepare("DELETE FROM person_links"),
        ...l.map((x) => db.prepare("INSERT INTO person_links (trip_id, traveler_id, secret, role) VALUES (?, ?, ?, ?)").bind(x.tripId, x.travelerId, x.secret, x.role))]);
    },
    async proposals(tripId) {
      const { results } = await db.prepare("SELECT json FROM proposals WHERE trip_id = ? ORDER BY at, id").bind(tripId).all<{ json: string }>();
      return results.map((r) => JSON.parse(r.json) as Proposal);
    },
    async saveProposal(p) {
      await db.prepare("INSERT INTO proposals (id, trip_id, at, json) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json")
        .bind(p.id, p.tripId, p.at, JSON.stringify(p)).run();
    },
    async appendLog(e) {
      await db.prepare("INSERT INTO log (trip_id, at, json) VALUES (?, ?, ?)").bind(e.tripId, e.at, JSON.stringify(e)).run();
    },
    async log() {
      const { results } = await db.prepare("SELECT json FROM log ORDER BY seq").all<{ json: string }>();
      return results.map((r) => JSON.parse(r.json) as LogEntry);
    },
  };
}
